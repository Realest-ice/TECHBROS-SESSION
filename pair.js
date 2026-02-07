const express = require('express');
const router = express.Router();
const fs = require('fs');
const pino = require('pino');
const { makeid } = require('./gen-id');
const { upload } = require('./mega');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    Browsers, 
    makeCacheableSignalKeyStore 
} = require('@whiskeysockets/baileys');
const { rimraf } = require('rimraf');

router.get('/', async (req, res) => {
    let num = req.query.code;
    if (!num) return res.json({ error: 'Phone Number Required' });
    
    const id = makeid();
    
    async function startSession() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        
        try {
            const sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.ubuntu("Chrome"),
            });

            if (!sock.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(num);
                if (!res.headersSent) res.send({ code });
            }

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection == "open") {
                    await delay(5000);
                    const credsPath = `./temp/${id}/creds.json`;
                    
                    try {
                        const megaUrl = await upload(fs.createReadStream(credsPath), `${sock.user.id}.json`);
                        const session_id = "TECHBROS-MD~" + megaUrl.replace('https://mega.nz/file/', '');

                        await sock.sendMessage(sock.user.id, { text: session_id });

                        // Branding Message
                        const desc = `*Hey there, TECHBROS User!* 👋🏻\n\n` +
                                     `🔐 *Session ID:* Sent above\n\n` +
                                     `*Powered by Realest_ice & Vidz*`;

                        await sock.sendMessage(sock.user.id, {
                            text: desc,
                            contextInfo: {
                                externalAdReply: {
                                    title: "TECHBROS CONNECTED",
                                    thumbnailUrl: "https://i.ibb.co/rKGw1wJh/file-000000005f3861fd86650fd7f57dde90.png",
                                    sourceUrl: "https://whatsapp.com/channel/0029VarWtitEgGfDrNnWs83N",
                                    mediaType: 1,
                                    renderLargerThumbnail: true
                                }
                            }
                        });

                    } catch (e) { console.error(e); }

                    await delay(3000);
                    await sock.ws.close();
                    if(fs.existsSync(`./temp/${id}`)) rimraf.sync(`./temp/${id}`);
                    
                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode != 401) {
                    await delay(3000); // Anti-Ban Delay
                    startSession();
                }
            });

        } catch (err) {
            if (!res.headersSent) res.json({ error: "Service Unavailable" });
        }
    }
    return await startSession();
});

module.exports = router;
