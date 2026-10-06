'use strict';
// SOLO PARA PRUEBAS: no se incluye en la version que se reparte.
// Conduce la ventana real segun ISHE_TEST_STEPS y guarda capturas y un resumen.

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

exports.run = async (getWindow, TEST) => {
  const steps = JSON.parse(process.env.ISHE_TEST_STEPS || '[]');
  const out = TEST.outDir;
  fs.mkdirSync(out, { recursive: true });
  const summary = { steps: [], errors: [] };
  try {
    const win = getWindow();
    const js = (code) => win.webContents.executeJavaScript(code, true);
    const waitFor = async (code, label) => {
      for (let i = 0; i < 400; i++) {
        if (await js(code)) return;
        await sleep(50);
      }
      throw new Error('timeout waiting for ' + label);
    };
    win.webContents.on('console-message', (_e, level, message) => {
      if (level >= 2) summary.errors.push('console: ' + message);
    });
    await waitFor('document.body.dataset.ready === "1"', 'ready');
    let plays = 0;
    let logins = 0;
    let logouts = 0;
    let exits = 0;
    let themes = 0;
    let names = 0;
    let keys = 0;
    let builds = 0;
    const themeStep = async (code) => {
      themes++;
      await js(code);
      await waitFor('document.body.dataset.themeDone === "' + themes + '"', 'theme change ' + themes);
    };
    for (const step of steps) {
      const cut = step.indexOf(':');
      const action = cut < 0 ? step : step.slice(0, cut);
      const arg = cut < 0 ? undefined : step.slice(cut + 1);
      if (action === 'shot') {
        await sleep(350);
        const image = await win.webContents.capturePage();
        fs.writeFileSync(path.join(out, arg + '.png'), image.toPNG());
      } else if (action === 'play') {
        plays++;
        await js('document.getElementById("play").click()');
        await waitFor('document.body.dataset.playDone === "' + plays + '"', 'play ' + plays);
      } else if (action === 'login') {
        // Abre el dialogo y espera a que muestre el codigo de Microsoft.
        await js('document.getElementById("account-button").click()');
        await waitFor('Boolean(document.body.dataset.loginCode)', 'login code');
      } else if (action === 'login-fail') {
        // Abre el dialogo cuando ni siquiera se puede pedir el codigo.
        logins++;
        await js('document.getElementById("account-button").click()');
        await waitFor('document.body.dataset.loginDone === "' + logins + '"', 'login failure ' + logins);
      } else if (action === 'login-open') {
        await js('document.getElementById("login-open").click()');
        await sleep(200);
      } else if (action === 'login-copy') {
        await js('document.getElementById("login-copy").click()');
        await sleep(200);
      } else if (action === 'login-cancel') {
        await js('document.getElementById("login-cancel").click()');
        await sleep(200);
      } else if (action === 'login-wait') {
        logins++;
        await waitFor('document.body.dataset.loginDone === "' + logins + '"', 'login ' + logins);
      } else if (action === 'logout') {
        logouts++;
        await js('document.getElementById("account-button").click()');
        await waitFor('document.body.dataset.logoutDone === "' + logouts + '"', 'logout ' + logouts);
      } else if (action === 'wait-exit') {
        exits++;
        await waitFor('document.body.dataset.gameExits === "' + exits + '"', 'game exit ' + exits);
      } else if (action === 'theme') {
        const [key, value] = arg.split('=');
        await themeStep('(() => { const i = document.getElementById("theme-' + key + '"); i.value = "' + value + '"; i.dispatchEvent(new Event("input")); i.dispatchEvent(new Event("change")); })()');
      } else if (action === 'theme-logo' || action === 'theme-logo-clear' || action === 'theme-reset') {
        await themeStep('document.getElementById("' + action + '").click()');
      } else if (action === 'update-wait') {
        await waitFor('document.body.dataset.updateStatus === "' + arg + '"', 'update status ' + arg);
      } else if (action === 'update-check') {
        await js('document.getElementById("update-check").click()');
      } else if (action === 'creator-key') {
        keys++;
        await js('document.getElementById("creator").open = true; document.getElementById("creator-key").click()');
        await waitFor('document.body.dataset.creatorKeyDone === "' + keys + '"', 'creator key ' + keys);
      } else if (action === 'creator-fill') {
        const [version, notes] = arg.split('|');
        await js('document.getElementById("creator-version").value = ' + JSON.stringify(version) + '; document.getElementById("creator-notes").value = ' + JSON.stringify(notes || ''));
      } else if (action === 'creator-build') {
        builds++;
        await js('document.getElementById("creator-build").click()');
        await waitFor('document.body.dataset.creatorDone === "' + builds + '"', 'creator build ' + builds);
      } else if (action === 'restart') {
        // Ultimo paso: se guarda el resumen y se pulsa "Reiniciar" (la aplicacion se cierra sola).
        fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(summary, null, 2));
        await js('document.getElementById("update-pill").click()');
        await sleep(3000);
        summary.errors.push('restart did not close the app');
      } else if (action === 'name' || action === 'name-clear') {
        names++;
        if (action === 'name') {
          await js('document.getElementById("provisional-name").value = ' + JSON.stringify(arg || '') + '; document.getElementById("provisional-save").click()');
        } else {
          await js('document.getElementById("provisional-clear").click()');
        }
        await waitFor('document.body.dataset.nameDone === "' + names + '"', 'display name ' + names);
        await sleep(300);
      } else if (action === 'name-link') {
        await js('document.getElementById("account-name-link").click()');
        await sleep(200);
      } else if (action === 'sleep') {
        await sleep(Number(arg) || 500);
      } else if (action === 'log') {
        await js('document.getElementById("toggle-log").click()');
      } else if (action === 'view') {
        await js('document.querySelector(\'.nav-item[data-view="' + arg + '"]\').click()');
      } else if (action === 'eval') {
        // eval:<etiqueta>|<codigo>  ejecuta codigo dentro de la ventana y guarda lo que devuelve
        const bar = arg.indexOf('|');
        summary.steps.push({ label: arg.slice(0, bar), value: await js(arg.slice(bar + 1)) });
      } else if (action === 'size') {
        const [width, height] = arg.split('x').map(Number);
        win.setSize(width, height);
        await sleep(300);
      } else if (action === 'wait') {
        await sleep(Number(arg));
      } else if (action === 'ram') {
        await js('(() => { const s = document.getElementById("ram"); s.value = "' + arg + '"; s.dispatchEvent(new Event("change")); })()');
        await sleep(200);
      } else if (action === 'dump') {
        summary.steps.push(await js(`window.ishe.getState().then((mainState) => ({
          label: ${JSON.stringify(arg || '')},
          state: mainState,
          accountName: document.getElementById('account-name').textContent,
          accountSub: document.getElementById('account-sub').textContent,
          accountButton: document.getElementById('account-button').textContent,
          loginHidden: document.getElementById('login').hidden,
          loginCode: document.getElementById('login-code').textContent,
          loginPage: document.getElementById('login-page').textContent,
          loginStatus: document.getElementById('login-status').textContent,
          loginCopy: document.getElementById('login-copy').textContent,
          legal: document.getElementById('legal').textContent,
          sessionHint: document.getElementById('session-hint').textContent,
          pageText: document.body.innerText,
          themeData: document.body.dataset.theme,
          nameLinkHidden: document.getElementById('account-name-link').hidden,
          provisionalHidden: document.getElementById('provisional').hidden,
          provisionalHint: document.getElementById('provisional-hint').textContent,
          provisionalClearHidden: document.getElementById('provisional-clear').hidden,
          accountTitle: document.getElementById('account-name').title,
          activeView: (document.querySelector('.view.is-active') || {}).id,
          focused: document.activeElement ? document.activeElement.id : '',
          cssColor1: getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim(),
          cssColor2: getComputedStyle(document.documentElement).getPropertyValue('--violet').trim(),
          cssBg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
          cssPanel: getComputedStyle(document.documentElement).getPropertyValue('--panel').trim(),
          playTextColor: getComputedStyle(document.getElementById('play')).color,
          bodyBackground: getComputedStyle(document.body).backgroundColor,
          logoSrc: document.getElementById('brand-logo').getAttribute('src'),
          logoSize: [document.getElementById('brand-logo').naturalWidth, document.getElementById('brand-logo').naturalHeight],
          face: document.body.dataset.face || '',
          faceHidden: document.getElementById('account-face').hidden,
          avatarHidden: document.getElementById('account-avatar').hidden,
          footVersion: document.getElementById('foot-version').textContent,
          versionLine: document.getElementById('version-line').textContent,
          updateStatus: document.body.dataset.updateStatus,
          updateText: document.getElementById('update-status').textContent,
          updatePillHidden: document.getElementById('update-pill').hidden,
          updatePill: document.getElementById('update-pill').textContent,
          newsTitles: Array.from(document.querySelectorAll('.news-title')).map((n) => n.textContent),
          newsTexts: Array.from(document.querySelectorAll('.news-text')).map((n) => n.textContent),
          creatorKeyStatus: document.getElementById('creator-key-status').textContent,
          creatorBuildDisabled: document.getElementById('creator-build').disabled,
          creatorVersion: document.getElementById('creator-version').value,
          creatorResult: document.getElementById('creator-result').textContent,
          creatorStepsHidden: document.getElementById('creator-steps').hidden,
          creatorFiles: document.getElementById('creator-files').textContent,
          creatorTag: document.getElementById('creator-tag').textContent,
          status: document.getElementById('status').textContent,
          statusClass: document.getElementById('status').className,
          noticeHidden: document.getElementById('notice').hidden,
          noticeTitle: document.getElementById('notice-title').textContent,
          noticeText: document.getElementById('notice-text').textContent,
          noticeItems: Array.from(document.querySelectorAll('#notice-list li')).map((n) => n.textContent),
          log: document.getElementById('log').textContent,
          playLabel: document.getElementById('play').textContent,
          playDisabled: document.getElementById('play').disabled,
          mods: Array.from(document.querySelectorAll('.mod-name')).map((n) => n.textContent),
          modsLead: document.getElementById('mods-lead').textContent,
          ram: document.getElementById('ram').value,
          ramHint: document.getElementById('ram-hint').textContent,
          gameDir: document.getElementById('game-dir').textContent,
          news: document.querySelectorAll('.news-card').length,
          nodeAccess: typeof require !== 'undefined' || typeof process !== 'undefined',
          bridge: Object.keys(window.ishe).sort().join(','),
        }))`));
      }
    }
  } catch (error) {
    summary.errors.push(String(error && error.stack ? error.stack : error));
  }
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(summary, null, 2));
  app.quit();
};
