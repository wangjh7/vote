const express = require("express")
const fs = require('fs')
// const http = require('http')
const https = require('https')
const router = require('./vote-router')
const app = express()

// const server = http.createServer(app)
const httpsServer = https.createServer({
  key:fs.readFileSync('/root/.acme.sh/johann.one/johann.one.key'),
  cert:fs.readFileSync('/root/.acme.sh/johann.one/johann.one.cer'),
},app)

//投票id 到 订阅这个投票信息更新的websocket 的映射
let voteIdWsMap = {}


app.use("/vote",express.static(__dirname + "/build"))
app.use("/vote",express.static(__dirname + "/static"))
app.use("/vote/uploads",express.static(__dirname + "/uploads")) //上传的文件都在uploads文件夹，作为静态文件服务出来
app.use("/vote",express.json()) //解析jquery的表单请求 Content-Type: application/json 
app.use("/vote",express.urlencoded({extended:true})) //解析普通表单请求 Content-Type: application/x-www-form-urlencoded

app.set("x-powered-by",false)
app.locals.pretty = true
app.use('/vote',router)


exports.voteIdWsMap = voteIdWsMap
exports.httpsServer = httpsServer