# PC Advisor (PCAdvisor NEW)

A web application and backend service designed to provide PC hardware advice, recommendations, and data management, powered by Node.js, Express, and Excel data processing.

## 🚀 Overview

**PCAdvisor NEW** is a robust system built to analyze, manage, and serve PC hardware recommendations and technical data. By leveraging Excel spreadsheets as a data source via SheetJS (`xlsx`), the backend processes hardware specifications to help users find optimal PC configurations.

## 📂 Project Structure

```text
PCAdvisor NEW/
├── data/
│   └── PCAdvisor_data.xlsx      # Core hardware database and rules spreadsheet
├── node_modules/                # Project dependencies (Express, body-parser, cors, etc.)
├── package-lock.json            # Dependency lock file
└── [Application Source Files]   # Express backend and utility scripts
```

## 🛠️ Tech Stack & Dependencies

- **Runtime:** Node.js
- **Framework:** Express.js (`v4.x`)
- **Data Processing:** SheetJS (`xlsx`, `cfb`, `codepage`, `adler-32`, `crc-32`) for reading and managing Excel-based hardware data.
- **Middleware & Utilities:** 
  - `body-parser`: Handling incoming request bodies.
  - `cors`: Cross-Origin Resource Sharing support.
  - `accepts`, `bytes`, `content-type`: HTTP request content negotiation and parsing.
  - `debug`: Logging and debugging utility.

## ⚙️ Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd "PCAdvisor NEW"
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Data:**
   Ensure `PCAdvisor_data.xlsx` is placed correctly inside the `data/` directory.

4. **Run the application:**
   ```bash
   npm start
   # or directly with node
   node index.js
   ```

## 📊 Data Source

The source hardware catalog is `data/PCAdvisor_data.xlsx`. `data/firebase-import.json` is the Firebase Realtime Database import file, generated from its 70 rows and organized into `categories`, `brands`, and `products` nodes. The browser reads the catalog from Realtime Database; product recommendations continue to use the Express API.

## Firebase

- Realtime Database URL: `https://pcadvisor-7e1f4-default-rtdb.asia-southeast1.firebasedatabase.app`
- Import `data/firebase-import.json` at the database root to seed the catalog.
- The browser reads the public catalog from `categories`, `brands`, and `products`. `database.rules.json` denies public writes and denies access to other paths.
- Firebase Authentication and Cloud Firestore store member accounts and per-user favorites separately.

## 📄 License

This project is proprietary and confidential.
