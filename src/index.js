'use strict';
// モジュールの読み込み
const {app, Menu, Tray, shell, BrowserWindow, dialog, ipcMain} = require('electron');
const {execFile} = require('child_process');
const request = require('request');
const fs = require('fs');
const packageJson = require('./package.json');
const appPath = app.getAppPath(); // "\dc_DiSpeak.git\src" "\DiSpeak\resources\app.asar"
const repPath = appPath.replace(/\\src/, '').replace(/\\resources\\app\.asar/, ''); // '\dc_DiSpeak.git' '\DiSpeak'
const exePath = app.getPath('exe'); // '\dc_DiSpeak.git\node_modules\electron\dist\electron.exe' '\DiSpeak\DiSpeak.exe'
const userData = app.getPath('userData'); // \AppData\Roaming\DiSpeak
// DiSpeakの設定ファイル
const appSetting = `${repPath}\\setting.json`;
let appSettingObj = {};
// windowの設定ファイル
const winSetting = `${userData}\\setting.json`;
let winSettingObj = readFileSync(winSetting);
// 変数の指定
const nowVersion = packageJson['version'];
const appName = app.getName();
let mainWindow = null; // メインウィンドウはGCされないようにグローバル宣言
let tray = null;
// 起動時にバージョンのチェックを行う
apiCheck('start');
// Electronの初期化完了後に実行
app.on('ready', () => {
  createMainwindow(); // mainWindowの生成
});
// 全てのウィンドウが閉じたら終了
app.on('window-all-closed', () => {
  if (process.platform != 'darwin') {
    app.quit();
  }
});
// ------------------------------
// 処理用の関数
// ------------------------------
// APIチェック
function apiCheck(status) {
  const apiOptions = {
    url: 'https://api.github.com/repos/micelle/dc_DiSpeak/releases/latest',
    headers: {'User-Agent': 'Awesome-Octocat-App'},
    json: true
  };
  request.get(apiOptions, function(err, res, data) {
    if (!err && res.statusCode == 200) resCheck(data, status);
  });
}

function resCheck(data, status) {
  // APIの上限を超えたとき
  if (data.message !== void 0 && status == 'check') {
    const mesOptions = {
      type: 'error',
      buttons: ['OK'],
      title: 'エラー',
      message: '最新のバージョン取得に失敗しました。',
      detail: '時間を置いてからご確認ください。お願いします。'
    };
    dialog.showMessageBox(mesOptions);
    return;
  }
  // APIを取得できたとき
  const relVer = data.tag_name;
  //let relVer = (function(){if(status == 'check') return data.tag_name;return 'v11.45.14';})(); // テスト用
  const relVer_v = relVer.replace(/v/g, '');
  const relName = data.name;
  // バージョンチェック
  const nowVer = arraySplit(nowVersion);
  const newVer = arraySplit(relVer_v);
  const result = updateCheck(nowVer, newVer);
  if (result) {
    const mesOptions = {
      type: 'warning',
      buttons: ['Yes', 'No'],
      title: relName,
      message: 'おぉっと？',
      detail: `お使いのバージョンは古いっす。ダウンロードページ開く？？\n\n` +
        `現在のバージョン：${nowVersion}\n最新のバージョン：${relVer_v}`
    };
    dialog.showMessageBox(mesOptions, function(res) {
      if (res == 0) {
        shell.openExternal(data.html_url);
      }
    });
  } else if (status == 'check') {
    const mesOptions = {
      type: 'info',
      buttons: ['OK'],
      title: relName,
      message: 'おぉ…！！',
      detail: `最新のバージョンを使ってるっす。ありがとおぉおおぉっ！！\n\n` +
        `現在のバージョン：${nowVersion}\n最新のバージョン：${relVer_v}`
    };
    dialog.showMessageBox(mesOptions);
  }
}
// バージョンを配列化
function arraySplit(txt) {
  const ary = txt.split('.');
  const obj = [];
  for (let v of ary) {
    const num = Number(v);
    obj.push(num);
  }
  return obj;
}
// バージョンの確認
function updateCheck(nowVer, newVer) {
  const nowMajor = nowVer[0],
    nowMinor = nowVer[1],
    nowBuild = nowVer[2],
    newMajor = newVer[0],
    newMinor = newVer[1],
    newBuild = newVer[2];
  if (newMajor > nowMajor) {
    return true;
  } else if (newMajor < nowMajor) {
    return false;
  } else
  if (newMinor > nowMinor) {
    return true;
  } else if (newMinor < nowMinor) {
    return false;
  } else
  if (newBuild > nowBuild) {
    return true;
  } else if (newBuild < nowBuild) {
    return false;
  } else {
    return false;
  }
}
// メインウィンドウの処理
function createMainwindow() {
  // タスクトレイを表示
  createTray();
  //ウィンドウサイズを設定する
  mainWindow = new BrowserWindow({
    frame: false,
    show: false,
    width: 940,
    height: 500,
    minWidth: 640,
    minHeight: 480,
    icon: `${__dirname}/images/icon.png`,
    //webPreferences: {nodeIntegration: false}
  });
  // ウィンドウメニューをカスタマイズ
  const template = mainWindowMenu();
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
  // 使用するhtmlファイルを指定する
  mainWindow.loadURL(`file://${__dirname}/index.html`);
  // リンクをデフォルトブラウザで開く
  mainWindow.webContents.on('new-window', (ev, url) => {
    ev.preventDefault();
    shell.openExternal(url);
  });
  // winSettingObjに設定があれば処理する
  const bounds = winSettingObj.bounds;
  if (bounds) mainWindow.setBounds(bounds);
  if (winSettingObj.maximized) mainWindow.maximize();
  if (winSettingObj.minimized) mainWindow.minimize();
  // ウィンドウの準備ができたら表示
  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });
  // ウィンドウが閉じる時
  mainWindow.on('close', () => {
    let ary = {};
    const isMaximized = mainWindow.isMaximized(); // true, false
    const isMinimized = mainWindow.isMinimized();
    const bounds = mainWindow.getBounds(); // {x:0, y:0, width:0, height:0}
    ary.maximized = isMaximized;
    ary.minimized = isMinimized;
    if (isMaximized) {
      ary.bounds = winSettingObj.bounds; // 最大化してるときは変更しない
    } else {
      ary.bounds = bounds;
    }
    const close = appSettingObj.dispeak.window;
    if (close) writeFileSync(winSetting, ary);
  });
  // ウィンドウが閉じられたらアプリも終了
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}
// タスクトレイ
function createTray() {
  tray = new Tray(`${__dirname}/images/icon.png`);
  const template = taskTrayMenu();
  const menu = Menu.buildFromTemplate(template)
  tray.setContextMenu(menu);
  tray.setToolTip(`${appName} v${nowVersion}`);
  tray.on('click', function() {
    mainWindow.show();
  });
}
// 設定ファイルの読み書き
function readFileSync(target) {
  let res = {};
  try {
    const data = fs.readFileSync(target, 'utf8');
    const ary = JSON.parse(data);
    Object.assign(res, ary);
  } catch (err) {
    return null;
  }
  return res;
}

function writeFileSync(target, data) {
  const json = JSON.stringify(data, null, 2);
  try {
    fs.writeFileSync(target, json, 'utf8');
  } catch (err) {
    return err.code;
  }
  return true;
}
// ------------------------------
// レンダラープロセスとのやりとり
// ------------------------------
// DiSpeakのディレクトリを返す
ipcMain.on('directory-app-check', (event) => {
  event.returnValue = appPath;
});
//ipcMain.on('directory-rep-check', (event) => {
//  event.returnValue = repPath;
//});
//ipcMain.on('directory-exe-check', (event) => {
//  event.returnValue = exePath;
//});
// 現在のバージョンを返す
ipcMain.on('now-version-check', (event) => {
  event.returnValue = nowVersion;
});
// 設定ファイルを返す
ipcMain.on('setting-file-read', (event) => {
  event.returnValue = readFileSync(appSetting);
});
// 設定ファイルを保存する
ipcMain.on('setting-file-write', (event, data) => {
  appSettingObj = data;
  event.returnValue = writeFileSync(appSetting, data);
});
// UIの挙動
ipcMain.on('window-minimize', () => {
  mainWindow.minimize();
});
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => {
  if (appSettingObj == null || appSettingObj.dispeak == null){
    mainWindow.hide();
  } else if (appSettingObj.dispeak.close) {
    app.quit();
  } else {
    mainWindow.hide();
  }
});
// 棒読みちゃんのディレクトリ
ipcMain.on('bouyomi-dir-dialog', (event) => {
  let options = {
    title: '選択',
    filters: [{
      name: 'EXE File',
      extensions: ['exe']
    }],
    defaultPath: '.',
    properties: ['openFile'],
  };
  dialog.showOpenDialog(options, (filePaths) => {
    let filePath = (function() {
      if (filePaths == void 0) return '';
      return filePaths[0];
    })();
    event.returnValue = filePath;
  });
});
ipcMain.on('bouyomi-exe-start', (event, data) => {
  let child = execFile(data, (error, stdout, stderr) => {
    //console.error("error=>", error);
    //console.error("stdout=>", stdout);
    //console.error("stderr=>", stderr);
  });
  let res = (function(){
    if (child.pid == null) return false;
    return true;
  })();
  //console.error("child=>", child);
  event.returnValue = res;
});
// ------------------------------
// その他
// ------------------------------
// エラーの処理
process.on('uncaughtException', (err) => {
  console.log(err);
  let errStr = String(err);
  let errMess = (function() {
    if (errStr.match(/'toggleDevTools' of null/)) return '「でぃすぴーくについて」が開かれていません';
    return '不明なエラー';
  })();
  let mesOptions = {
    type: 'error',
    buttons: ['OK'],
    title: 'エラーが発生しました',
    message: `${errMess}`,
    detail: `詳細：\n${errStr}`
  };
  dialog.showMessageBox(mesOptions);
});
// ウィンドウメニューをカスタマイズ
function mainWindowMenu() {
  let template = [{
      label: 'メニュー',
      submenu: [{
          label: 'リロード',
          accelerator: 'CmdOrCtrl+R',
          click: function() {
            mainWindow.reload();
          }
        },
        {
          label: '終了する',
          accelerator: 'CmdOrCtrl+W',
          position: 'endof=cmd',
          click: function() {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'ヘルプ',
      submenu: [{
          label: 'Wikiを開く',
          accelerator: 'F1',
          click: function() {
            shell.openExternal('https://github.com/micelle/dc_DiSpeak/wiki');
          }
        },
        {
          label: 'デバッグ - main',
          accelerator: 'CmdOrCtrl+Shift+I',
          position: 'endof=debug',
          click: function() {
            mainWindow.toggleDevTools();
          }
        },
        {
          label: '最新のバージョンを確認',
          accelerator: 'CmdOrCtrl+H',
          position: 'endof=info',
          click: function() {
            apiCheck('check');
          }
        }
      ]
    }
  ];
  return template;
}

function taskTrayMenu() {
  let template = [{
      label: '表示する',
      click: function() {
        mainWindow.show();
      }
    },
    {
      label: 'サイズを元に戻す',
      click: function() {
        mainWindow.setSize(940, 500);
        mainWindow.center();
      }
    },
    {
      label: 'バージョンの確認',
      click: function() {
        apiCheck('check');
      }
    },
    {
      label: 'Wikiを開く',
      position: 'endof=info',
      click: function() {
        shell.openExternal('https://github.com/micelle/dc_DiSpeak/wiki');
      }
    },
    {
      label: '終了する',
      position: 'endof=cmd',
      click: function() {
        //mainWindow.close();
        app.quit();
      }
    }
  ];
  return template;
}