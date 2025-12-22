const fs = require('fs');
const key = fs.readFileSync('./scholarstream-2217c-firebase-adminsdk-fbsvc-f2577185a5.json', 'utf8')
const base64 = Buffer.from(key).toString('base64')
console.log(base64)