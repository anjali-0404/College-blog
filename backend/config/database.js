const mysql = require("mysql2");

const pool = mysql.createPool({
  host: "localhost",     // or "127.0.0.1"
  user: "root",          // check your MySQL username
  password: "trian", // make sure this matches
  database: "college",   // check DB name
  port: 3306
});

module.exports = pool.promise();
