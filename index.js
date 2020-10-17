const port = 8080
const {httpsServer} = require('./vote')
const WebSocket = require('ws')
const voteIdWsMap =  require( './vote')

let db
const dbPromise = require("./vote-api-db")
dbPromise.then(value=>{
  db = value
})

const httpWss = new WebSocket.Server({server:httpsServer})
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


httpsServer.listen(port,()=>{
  console.log("listening on port ",port)
})