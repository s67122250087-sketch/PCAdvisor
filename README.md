# PC Advisor

PC Advisor is a Thai-language PC hardware catalog and recommendation website. Its interface uses React and Vite, its server-side recommendation API uses Node.js and Express, and its catalog is read from Firebase Realtime Database.

## Run locally

Requirements: Node.js 20.19+ or 22.12+.

```bash
npm install
npm start
```

Open `http://localhost:3000`. `npm start` builds the React app into `dist/` and starts the Express server. For frontend development with Vite, run `npm run dev`.

## Deployment

For Render, create a Web Service from the GitHub repository. Use `npm install` as the build command and `npm start` as the start command. The application builds its React frontend at startup, while Express serves the frontend and recommendation API together.

## Firebase

- `src/firebase.js` initializes the web SDK for the PCAdvisor Firebase project.
- The product catalog is read from the `products` node in Realtime Database.
- Firebase Authentication uses Email/Password sign-in and registration.
- A signed-in user's favorites are stored in Firestore under `users/{uid}`; guest favorites remain in browser storage.
- `data/firebase-import.json` contains the catalog import data. `database.rules.json` defines Realtime Database access rules.

The Firebase web configuration in `src/firebase.js` identifies the web app and is expected to be present in client code. Protect data with Firebase security rules and restrict the API key in Google Cloud if needed.

## Project structure

```text
src/                  React app and Firebase SDK setup
public/image/          Product images copied into the production build
data/                  Catalog spreadsheet and Firebase import JSON
scripts/copy-assets.js Copies static assets into dist after Vite builds
server.js              Express APIs and production static-file server
index.html              Vite HTML entry point
vite.config.js          Vite build configuration
```
