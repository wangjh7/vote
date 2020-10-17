const express = require("express")
const fs = require('fs')
const WebSocket = require('ws')
// const http = require('http')
const https = require('https')
const router = require('./vote-router')

const port = 8080
const app = express()

// const server = http.createServer(app)
const httpsServer = https.createServer({
  key:fs.readFileSync('/root/.acme.sh/johann.one/johann.one.key'),
  cert:fs.readFileSync('/root/.acme.sh/johann.one/johann.one.cer'),
},app)
// const wss = new WebSocket.Server({server})
const httpWss = new WebSocket.Server({server:httpsServer})

let db
const dbPromise = require("./vote-api-db")
dbPromise.then(value=>{
  db = value
})


//投票id 到 订阅这个投票信息更新的websocket 的映射
let voteIdWsMap = {}
httpWss.on('connection', async(ws,req)=>{
  voteId = req.url.split('/').slice(-1)[0]
  // console.log(`将会把${voteId}的实时信息发送到客户端`)
  let voteInfo = await db.get('SELECT rowid AS id, * FROM votes WHERE id = ?', voteId)
  if(Date.now() > new Date(voteInfo.ddl).getTime() ) {
    ws.close()
    return
  }
  if(voteId in voteIdWsMap){
    voteIdWsMap[voteId].push(ws)
  } else {
    voteIdWsMap[voteId] = [ws]
  }
  ws.on('close',()=>{
    voteIdWsMap[voteId] = voteIdWsMap[voteId].filter(it => it !== ws)
  })
})

app.use("/vote",express.static(__dirname + "/build"))
app.use("/vote",express.static(__dirname + "/static"))
app.use("/vote/uploads",express.static(__dirname + "/uploads")) //上传的文件都在uploads文件夹，作为静态文件服务出来
app.use("/vote",express.json()) //解析jquery的表单请求 Content-Type: application/json 
app.use("/vote",express.urlencoded({extended:true})) //解析普通表单请求 Content-Type: application/x-www-form-urlencoded

app.set("x-powered-by",false)
app.locals.pretty = true
app.use('/vote',router)



httpsServer.listen(port,()=>{
  console.log("listening on port ",port)
})

module.exports = voteIdWsMap