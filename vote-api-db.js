const sqlite3 = require("sqlite3")
const sqlite = require("sqlite")

module.exports = sqlite.open({
  filename:__dirname + "/vote.db",
  driver: sqlite3.Database
})