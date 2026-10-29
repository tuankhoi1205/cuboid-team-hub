const path = require("node:path");
module.exports = {
  apps: [{
    name: "cuboid-team-hub",
    cwd: __dirname,
    script: path.join(__dirname, "start.mjs"),
    interpreter: "node",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    restart_delay: 3000,
    kill_timeout: 10000,
    env: { NODE_ENV: "production", HUB_PORT: "3210" },
  }],
};
