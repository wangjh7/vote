const cookieParser = require("cookie-parser")
const multer = require("multer")
const fsp = require("fs").promises
const session = require("express-session")
const svgCaptcha = require("svg-captcha")
const express = require('express')
// const cors = require('cors')


const uploader = multer({dest:__dirname + "/uploads/"})
let db
const dbPromise = require("./vote-api-db")
dbPromise.then(value=>{
  db = value
})
const router = express.Router()

router.use((req,res,next)=>{
  console.log(req.method,req.url)
  next()
})
// app.use(cors({
//   maxAge:86400,
//   origin:true,
//   credentials:true
// }))


router.use(cookieParser("gouliguojiashengsiyi"))
router.use(session())

router.use(async(req,res,next)=>{
  // console.log(req.cookies,req.signedCookies)
  if(req.signedCookies.user){
    //说明用户已登录,将登录的用户的信息挂在req.user
    req.user = await db.get("SELECT rowId AS id, * FROM users WHERE name = ?",req.signedCookies.user)
  }
  next()
})


//创建投票
/*
{
  title,
  description,
  options:['xxx','xxx'],
  ddl,
  anonymous,
  multiple
}
*/
router.post('/createvote',async(req,res,next)=>{
  if(req.user){
    let voteInfo = req.body
    await db.run('INSERT INTO votes VALUES (?,?,?,?,?,?,?)',
    [voteInfo.title,voteInfo.description,req.user.id,voteInfo.ddl,
      voteInfo.anonymous, new Date().toISOString(),voteInfo.multiple
    ])
    let vote = await db.get('SELECT rowid AS id, * FROM votes ORDER BY id DESC LIMIT 1')
    for (let option of voteInfo.options){
      await db.run(
        'INSERT INTO options VALUES (?,?,?)',
        [vote.id,option,0]
      )
    }
    res.json({
      voteId:vote.id
    })
  } else {
    res.status(401/*Unauthorized*/).json({
      code:0,
      msg:"用户未登录"
    })
  }
})

//查看投票页面
router.get('/vote/:id',async(req,res,next)=>{
  // console.log(req.params)
  let id = req.params.id
  let vote = await db.get('SELECT rowid AS id, * FROM votes WHERE id = ?',id)
  let options = await db.all('SELECT rowid AS id , * FROM options WHERE voteId = ?',id)
  let votings = await db.all('SELECT * FROM votings JOIN users ON userId = users.rowid WHERE voteId = ?',id)
  vote.options = options
  vote.votings = votings
  res.json(vote)
})

//用户对某个选项发起投票
/*
{
  optionId:3,
  cancel:true
}
 */
router.post('/vote/:id',async(req,res,next)=>{
  let optionId = req.body.optionId
  let voteId = req.params.id
  let userId = req.user.id
  let vote = await db.get('SELECT rowid AS id, * FROM votes WHERE id = ?',voteId)
  if(Date.now() > new Date(vote.ddl).getTime()) {
    res.status(401).end({
      code:0,
      msg:'该问题已过截止时间，不能再投票'
    })
    return
  }
  if(vote.multiple){ //多选
    if(req.body.cancel){
      await db.run('DELETE FROM votings WHERE voteId = ? AND optionId = ? AND userId = ?',[voteId,optionId,userId])
    } else {
      await db.run('INSERT INTO votings VALUES (?,?,?)',[voteId,optionId,userId])
    }
    res.end()
  } else { //单选
    if(req.body.cancel){
      await db.run('DELETE FROM votings WHERE userId = ? AND voteId = ?',[userId,voteId]) //取消上次的投票
    }else {
      await db.run('DELETE FROM votings WHERE userId = ? AND voteId = ?',[userId,voteId]) //取消上次的投票
      await db.run('INSERT INTO votings VALUES (?,?,?)',[voteId,optionId,userId])
    }
    res.end()
  }
  //有一个用户投了票，向所有websocket的连接发送这个投票的信息
  let votings = await db.all('SELECT * FROM votings JOIN users ON userId = users.rowid WHERE voteId = ?',voteId)
  let webSockets = voteIdWsMap[voteId] || []
  for(let ws of webSockets){
    ws.send(JSON.stringify(votings))
  }
})

//请求用户信息
router.get('/userinfo',async(req,res,next)=>{
  if(req.user){
    res.json(req.user)
  } else {
    res.status(404).json({
      code:0,
      msg:"用户未登录"
    })
  }
})

//用户查看自己创建的投票
router.get('/myvote',async(req,res,next)=>{
  if(!req.user){
    res.status(401).json({
      code:1,
      msg:'用户未登录'
    })
    return
  }
  let myVotes = await db.all('select rowid as id, * from votes where initByUid = ?',req.user.id)
  res.json(myVotes)
})

//注册
router.route("/signup")
  .post( async (req,res,next)=>{
    console.log("get the request for signing up",req.body)
    let user = req.body

    try{
      await db.run(
        `INSERT INTO users VALUES (?, ?, ?, ?)`,
        [user.username,user.password,user.email,"/uploads/avatar.png"]
        )
      //如果上面报错，下面就不走了，如果没报错，那就注册成功了
      
      res.cookie("user",user.name,{
        maxAge:86400000,
        signed: true
      })
      res.json({
        msg: "注册成功"
      })
    } catch(e){
      res.status(400).json({
        msg: "注册失败: " + e.toString(),
        code:0
      })
    }
  })

//注销
router.get("/logout",(req,res,next)=>{
  res.clearCookie("user")
  res.end()
})

//用户名冲突检测
// /username-conflict?username=xxx
router.get("/username-conflict", async (req,res,next)=>{
  if(req.query.username === undefined) {
    return 
  }
  let user = await db.get('SELECT * FROM users WHERE name = ?',req.query.username)
  if(user) {
    res.json({
      available:false,
      msg:"用户名已存在"
    })
  } else {
    res.json({
      available:true,
      msg:"用户名可用"
    })
  }
})

//邮箱冲突检测
// /email-conflict?email=xxx
router.get("/email-conflict", async (req,res,next)=>{
  if(req.query.email === undefined) {
    return 
  }
  console.log(req.query.email)
  let user = await db.get('SELECT * FROM users WHERE email = ?',req.query.email)
  if(user) {
    res.json({
      available:false,
      msg:"此邮箱已存在"
    })
  } else {
    res.json({
      available:true,
      msg:"此邮箱可用"
    })
  }
})

//获取验证码图片  
router.get("/captcha",async (req,res,next)=>{
  let captcha = svgCaptcha.create()
  req.session.captcha = captcha.text
  res.type("svg")
  res.status(200).send(captcha.data)
})

//登录
router.route("/login")
  .post( async (req,res,next)=>{
    console.log("get request for logging in", req.body)
    let loginInfo = req.body
    if(loginInfo.captcha !== req.session.captcha){
      res.status(401).json({
        code:2,
        msg:"验证码错误"
      })
      return 
    }

    let user = await db.get(
      'SELECT * FROM users WHERE name = ? AND password = ?',
      [loginInfo.name,loginInfo.password]
      )
    if(user){
      res.cookie("user",user.name,{
        maxAge:86400000,
        signed: true
      })
      res.json(user)
    } else{
      res.status(401).json({
        code:0,
        msg:"用户名或密码错误"
      })
    }
  })

//展示用户中心
router.get("/user/:id",async(req,res,next)=>{
  let userId = req.params.id
  let user = await db.get("SELECT * FROM users WHERE rowid = ?", userId)

  if(user){
    let userPostsPromise = db.all(
      "SELECT rowid AS id, * FROM posts WHERE userId = ? ORDER BY postedAt DESC",
      Number(userId)
    )
    let userCommentsPromise = db.all(
      `SELECT postId, title,comments.content AS commentContent, commentedAt
       FROM comments join posts on postId = posts.rowid 
      WHERE comments.userId = ? ORDER BY commentedAt DESC`,
      Number(userId)
    )
    let [userPosts,userComments] = await Promise.all([userPostsPromise,userCommentsPromise])
    res.json({
      currentAccount:req.user,
      posts:userPosts,
      comments: userComments,
      user
    })
  } else {
    res.end("can't find this one")
  }
})

//上传文件接口
router.post("/uploads",uploader.single("avatar"),async(req,res,next)=>{
  let file = req.file
  // console.log(file)
  // res.end("ok")
  let targetName = file.path + "-" + file.originalname
  await fsp.rename(file.path, targetName)
  let fileOnlineUrl = "/uploads/" + file.filename + "-" + file.originalname
  try{
    await db.run(
      `update users set avatar = ? where name = ?`,
      [fileOnlineUrl,req.user.name]
    )
    res.json({
      code:1,
      msg:"上传成功！"
    })
  } catch(e){
    res.json({
      code:0,
      msg:"上传失败！" + e.toString()
    })
  }
})

//由更改密码的id映射到对应的用户
let cpwMap = Object.create(null)
//忘记密码
router.route("/forget")
  .post(async(req,res,next)=>{
    // console.log(req.body)
    let email =req.body.email
    let user = await db.get("select * from users where email = ?", email)
    if(user){
      let cpwId = Math.random().toString(16).slice(2)
      let cpwLink = "http://localhost:8080/security-center/" + cpwId
      cpwMap[cpwId] = user
      setTimeout(()=>{
        delete cpwMap[cpwId]
      },10*60*1000)
      console.log(cpwLink,cpwMap)
      //SMTP协议发邮件
      // sendEmail(email,`
      // 请点击以下链接修改密码：${cpwLink}，
      // 如果链接不能点击请复制到浏览器打开。链接十分钟内有效`)
      res.json({
        code:1,
        msg:"改密邮件已发往您的邮箱，注意查收"
      })
    } else {
      res.json({
        code:0,
        msg:"该邮箱不存在"
      })
    }
  })

router.route("/security-center/:id")
  .get((req,res,next)=>{
    let user = cpwMap[req.params.id]
    if(user){
      res.json({
        user:user
      })
    } else {
      res.json({
        code:0,
        msg:"链接已过期"
      })
    }
  })
  .post( async (req,res,next)=>{
    // console.log(req.body.newPassword)
    let user = cpwMap[req.params.id]
    await db.run("update users set password = ? where name = ?",
    req.body.newPassword,user.name)
    delete cpwMap[req.params.id]
    res.json({
      code:1,
      msg:"修改成功！"
    })
  })

module.exports = router