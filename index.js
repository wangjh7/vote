const port = 8080
const {httpsServer} = require('./vote')


httpsServer.listen(port,()=>{
  console.log("listening on port ",port)
})