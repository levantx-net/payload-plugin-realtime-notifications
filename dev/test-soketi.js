import https from 'https';

const host = 'asaas-soketi-195147-138-201-61-71.sslip.io';

console.log('Testing HTTPS connection to host:', host);

const req = https.get(`https://${host}/`, (res) => {
  console.log('HTTPS Connection successful!');
  console.log('Status Code:', res.statusCode);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (e) => {
  console.error('HTTPS Connection failed:');
  console.error(e);
});

req.end();
