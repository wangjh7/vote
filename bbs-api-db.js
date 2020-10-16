const sqlite3 = require("sqlite3")
const sqlite = require("sqlite")

module.exports = sqlite.open({
  filename:__dirname + "/bbs.db",
  driver: sqlite3.Database
})