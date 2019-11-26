'use strict';

process.env.TZ = 'UTC';

const creds = {
    "type": "service_account",
    "project_id": "hmpo-pex",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/sms-log%40hmpo-pex.iam.gserviceaccount.com"
};

creds.client_id = process.env.client_id;
creds.client_email = process.env.client_email;
creds.private_key_id = process.env.private_key_id;
creds.private_key = process.env.private_key.replace(/\\n/g, '\n');
const spreadsheetId = process.env.spreadsheet_id;

const GoogleSpreadsheet = require('google-spreadsheet');
const http = require('http');
const moment = require('moment');
const app = http.createServer((req, res) => {
    const error = (msg, err, code) => {
        console.error(err);
        res.writeHead(code || 500);
        err ? res.write('Error ' + msg + ': ' + err.message) : res.write(msg);
        res.end();
    };

    if (req.method !== 'POST' || req.url !== '/sms/' + creds.private_key_id) {
        return error('Not Found', null, 400);
    }

    let rawBody = '';
    req.on('data',chunk => rawBody += chunk);
    req.on('end', () => {
        let body, row;
        try {
            switch (req.headers['content-type']) {
            case 'application/x-www-form-urlencoded':
                body = {};
                rawBody.split('&').forEach(l => {
                    let [n, v] = l.split('=');
                    body[decodeURIComponent(n)] = decodeURIComponent(v.replace(/\+/g, ' '));
                });
                break;
            case 'application/json':
                body = JSON.parse(rawBody);
                break;
            default:
                console.log('Content-Type:', req.headers['content-type']);
                console.log('Raw Body:', rawBody);
                return error('Unknown body type');
            }
            row = {
                Environment: body.user || 'twilio',
                DateTime: moment().format('YYYY-MM-DD HH:mm:ss'),
                Message: body.Body || body.msg
            };
            let pexid = row.Message && /(PEX|POD) ([0-9]{3}) ([0-9]{3}) ([0-9X]{4})/.exec(row.Message);
            if (pexid) {
                row.Source = pexid[1];
                row.PEXID = pexid[2] + pexid[3] + pexid[4];
            }
        } catch(e) {
            return error('bad body', e);
        }

        if (row.Environment.toLowerCase() === 'none') {
            // blackhole
            console.log('Ignored:', row);
            res.writeHead(200, 'OK');
            res.write('OK');
            res.end();
            return;
        }

        let doc = new GoogleSpreadsheet(spreadsheetId);
        doc.useServiceAccountAuth(creds,  err => {
            if (err) return error('connecting', err);
            doc.addRow(1, row, err => {
                if (err) return error('adding row', err);
                res.writeHead(200, 'OK');
                res.write('OK');
                res.end();
                console.log('Added:', row);
            });
        });
    });
});

app.listen(process.env.PORT || 3000);
