const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
fs.mkdirSync(output, { recursive: true });
fs.cpSync(path.join(root, "public", "image"), path.join(output, "image"), { recursive: true });
fs.copyFileSync(path.join(root, "public", "logo01.png"), path.join(output, "logo01.png"));
console.log("Copied public images and logo into dist.");
