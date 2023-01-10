const {
  app,
  BrowserWindow,
  globalShortcut,
  screen,
  ipcMain,
  shell,
  Tray,
  Menu,
} = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const child_process = require("child_process");
const download = require("download");
const { Octokit } = require("octokit");
const portfinder = require("portfinder");
const minimist = require("minimist");
const fetch = require("node-fetch");

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

const isSingleInstance = app.requestSingleInstanceLock();
if (!isSingleInstance) {
  console.log("Sunbeam is already running");
  app.quit();
  process.exit(0);
}

app.on("window-all-closed", () => {
  app.quit();
});

function createWindow(theme) {
  const bounds = getCenterOnCurrentScreen();
  const win = new BrowserWindow({
    title: "Sunbeam",
    width: 750,
    height: 475,
    frame: false,
    x: bounds.x,
    y: bounds.y,
    alwaysOnTop: true,
    skipTaskbar: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    movable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false,
    },
    resizable: false,
    type: "panel",
    hasShadow: true,
    backgroundColor: theme.background,
  });
  win.loadFile(path.join(__dirname, "index.html"));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  ipcMain.handle("hideWindow", () => {
    win.hide();
  });

  win.on("blur", () => {
    win.hide();
  });

  return win;
}

const getCenterOnCurrentScreen = () => {
  const cursor = screen.getCursorScreenPoint();
  // Get display with cursor
  const distScreen = screen.getDisplayNearestPoint({
    x: cursor.x,
    y: cursor.y,
  });

  const { width: screenWidth, height: screenHeight } = distScreen.workAreaSize;
  const width = 750;
  const height = 475;
  const x = distScreen.workArea.x + Math.floor(screenWidth / 2 - width / 2); // * distScreen.scaleFactor
  const y = distScreen.workArea.y + Math.floor(screenHeight / 2 - height / 2);

  return {
    width,
    height,
    x,
    y,
  };
};

function createTray(win) {
  const tray = new Tray(
    path.join(__dirname, "..", "assets", "tray-Template.png")
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        type: "normal",
        label: "Manual",
        click: () =>
          shell.openExternal("https://sunbeamlauncher.github.io/sunbeam"),
      },
      {
        type: "normal",
        label: "Report Bug",
        click: () =>
          shell.openExternal(
            "http://github.com/SunbeamLauncher/sunbeam/issues/new"
          ),
      },
      { type: "separator" },
      { type: "normal", label: "Quit", click: () => app.quit() },
    ])
  );

  return tray;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startSunbeam(host, port) {
  // start sunbeam process

  console.log(`Sunbeam host: ${host}`);
  console.log(`Sunbeam port: ${port}`);

  const shell = process.env.SHELL || "/bin/bash";
  return new Promise((resolve, reject) => {
    const sunbeamProcess = child_process.spawn(
      shell,
      ["-lic", `yolo serve --host ${host} --port ${port}`],
      {
        env: {
          ...process.env,
          TERM: "xterm-256color",
        },
      }
    );

    sunbeamProcess.stdout.on("data", (data) => {
      console.log(`Sunbeam: ${data}`);
    });

    sunbeamProcess.stderr.on("data", (data) => {
      console.error(`Sunbeam: ${data}`);
    });

    let exited = false;
    sunbeamProcess.on("exit", () => {
      exited = true;
      reject("Sunbeam exited");
    });

    sunbeamProcess.on("spawn", async () => {
      while (!exited) {
        console.log("Waiting for Sunbeam to start...");
        await sleep(1000);
        try {
          const res = await fetch(`http://${host}:${port}`);
          if (res.status === 200) {
            resolve(`${host}:${port}`);
            break;
          }
        } catch (e) {
          console.log("Sunbeam not started yet");
        }
      }
    });
  });
}

function registerShortcut(win) {
  globalShortcut.register("CommandOrControl+;", async () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      const centerBounds = getCenterOnCurrentScreen();
      const winBounds = win.getBounds();
      if (winBounds.x !== centerBounds.x || winBounds.y !== centerBounds.y) {
        win.setBounds(centerBounds);
      }
      win.show();
    }
  });
}

app.whenReady().then(async () => {
  const {
    theme: themeName = "tomorrow-night",
    host = "localhost",
    port = await portfinder.getPortPromise(),
  } = minimist(process.argv.slice(2));

  const themeDir = path.join(__dirname, "..", "themes");
  const themePath = path.join(themeDir, `${themeName}.json`);
  var theme = {};
  if (fs.existsSync(themePath)) {
    theme = JSON.parse(fs.readFileSync(themePath, "utf-8"));
  } else {
    theme = JSON.parse(
      fs.readFileSync(path.join(themeDir, "tomorrow-night.json"), "utf-8")
    );
  }

  ipcMain.handle("theme", async () => {
    return theme;
  });

  try {
    const address = await startSunbeam(host, port);
    ipcMain.handle("address", async () => {
      return address;
    });
  } catch (e) {
    console.error(e);
  }
  const win = createWindow(theme);
  registerShortcut(win);
  createTray(win);
});
