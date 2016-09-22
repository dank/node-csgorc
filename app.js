'use strict';

const Steam = require('steam');
const Protos = require('./helpers/protos.js');
var SteamId = require('steamid');
const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline-sync');

const accounts = fs.readFileSync('./accounts.txt', 'utf8').split('\n');
const steamId = new SteamId(readline.question('SteamID64: '));
const opt = readline.keyInSelect(['Report', 'Commend']);

if (steamId.isValid() && opt >= 0) {
  accounts.forEach(account => {
    const steamClient = new Steam.SteamClient();
    const steamUser = new Steam.SteamUser(steamClient);
    const steamGC = new Steam.SteamGameCoordinator(steamClient, 730);
    const steamFriends = new Steam.SteamFriends(steamClient);

    const user = account.split(':');
    let login = {
      account_name: user[0],
      password: user[1]
    };
    let keepAlive;

    fs.access(`./sentry/${user[0]}`, fs.F_OK, err => {
      if (!err) {
        console.info(`[${user[0]}] Sentryfile found!`);
        login.sha_sentryfile = fs.readFileSync(`./sentry/${user[0]}`);
      }
    });

    console.info(`[${user[0]}] Logging in...`);

    steamClient.connect();
    steamClient.on('connected', () => {
      steamUser.logOn(login);
    });

    steamClient.on('logOnResponse', res => {
      const eresult = res.eresult;

      if (eresult === Steam.EResult.OK) {
        console.info(`[${user[0]}] Logged in!`);

        steamFriends.setPersonaState(Steam.EPersonaState.Offline);
        steamUser.gamesPlayed({
          games_played: [{
            game_id: 730
          }]
        });

        keepAlive = setInterval(() => {
          steamGC.send({
            msg: 4006,
            proto: {}
          }, new Protos.CMsgClientHello({}).toBuffer());
        }, 2000);
      } else if (eresult === Steam.EResult.AccountLoginDeniedNeedTwoFactor) {
        login.two_factor_code = readline.question(`[${user[0]}] Mobile auth code: `);
        steamClient.disconnect();
        steamClient.connect();
      } else if (eresult === Steam.EResult.AccountLogonDenied) {
        login.auth_code = readline.question(`[${user[0]}] Steam Guard code: `);
        steamClient.disconnect();
        steamClient.connect();
      } else {
        console.error(res);
      }
    });

    steamUser.on('updateMachineAuth', (data, next) => {
      function SHA1(bytes) {
        var shasum = crypto.createHash('sha1');
        shasum.end(bytes);
        return shasum.read();
      }

      fs.writeFileSync(`./sentry/${user[0]}`, SHA1(data.bytes));
      next({sha_file: SHA1(data.bytes)});
    });

    steamClient.on('error', err => {
      console.error(`[${user[0]}] ${err}`);
      steamClient.disconnect();
    });

    steamGC.on('message', (header, buffer, next) => {
      switch (header.msg) {
        case 4004:
          clearInterval(keepAlive);
          if (opt == 0) {
            report(steamGC, steamId, user[0]);
          } else if (opt == 1) {
            commend(steamGC, steamId, user[0]);
          } else {
            console.error('idk');
          }
          break;
        case Protos.ECsgoGCMsg.k_EMsgGCCStrike15_v2_MatchmakingGC2ClientHello:
          break;
        case Protos.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientReportResponse:
          const confirm = Protos.CMsgGCCStrike15_v2_ClientReportResponse.decode(buffer).confirmationId;
          if (confirm) {
            console.info(`[${user[0]}] Report confirmation ID: ${confirm.toString()}`);
          } else {
            console.info(`[${user[0]}] Commended.`)
          }
          steamClient.disconnect();
          break;
        default:
          console.info(header);
          break;
      }
    });
  });
} else {
  console.error('Invalid input. Killing...');
}

function report(gc, sid, user) {
  console.info(`[${user}] Reporting...`);

  var accountId = sid.accountid;
  gc.send({
    msg: Protos.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientReportPlayer,
    proto: {}
  }, new Protos.CMsgGCCStrike15_v2_ClientReportPlayer({
    accountId: accountId,
    matchId: 8,
    rptAimbot: 2,
    rptWallhack: 3,
    rptSpeedhack: 4,
    rptTeamharm: 5,
    rptTextabuse: 6,
    rptVoiceabuse: 7
  }).toBuffer());
}

function commend(gc, sid, user) {
  console.info(`[${user}] Commending...`);

  var accountId = sid.accountid;
  gc.send({
    msg: Protos.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientCommendPlayer,
    proto: {}
  }, new Protos.CMsgGCCStrike15_v2_ClientCommendPlayer({
    accountId: accountId,
    matchId: 8,
    tokens: 10,
    commendation: new Protos.PlayerCommendationInfo({
      cmdFriendly: 1,
      cmdTeaching: 2,
      cmdLeader: 4
    })
  }).toBuffer());
}
