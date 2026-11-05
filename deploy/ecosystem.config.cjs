const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// This dedicated Unix identity must be provisioned by the host owner first.
if (process.platform !== 'linux' || os.userInfo().username !== 'sadovskiy-mobile') {
  throw new Error('Run only as the dedicated sadovskiy-mobile service user');
}
const privateDirectory = '/var/lib/sadovskiy-mobile';
const database = path.join(privateDirectory, 'team.sqlite');
if (!fs.existsSync(database)) {
  throw new Error('Private database has not been provisioned; refusing an empty deployment');
}
// Candidate only: the administrator must confirm this port is available.
const port = Number(process.env.FEATUREFLOW_PORT || '21003');
if (!Number.isInteger(port) || port < 21000 || port > 21099) {
  throw new Error('Use a confirmed port in the assigned 21000–21099 range');
}
module.exports = {
  apps: [{
    name: 'sadovskiy-mobile-api',
    cwd: path.resolve(__dirname, '..'),
    script: 'backend/server.py',
    interpreter: '/usr/bin/python3',
    args: ['--db', database, 'serve', '--host', '127.0.0.1', '--port', String(port)],
    exec_mode: 'fork',
    instances: 1,
    watch: false,
    autorestart: true,
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 3000,
    max_memory_restart: '384M',
    kill_timeout: 5000,
    out_file: path.join(privateDirectory, 'logs', 'out.log'),
    error_file: path.join(privateDirectory, 'logs', 'error.log'),
    time: true,
    env: { PYTHONUNBUFFERED: '1' },
  }],
};
