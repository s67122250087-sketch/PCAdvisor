const express = require("express");
const cors = require("cors");
const XLSX = require("xlsx");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const excelPath = path.join(__dirname, "data", "PCAdvisor_data.xlsx");

// ฟังก์ชันโหลดและแปลงข้อมูลจาก Excel
function loadProducts() {
  try {
    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames.includes("Master_Dataset") ? "Master_Dataset" : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "-" });

    return rows.map(row => ({
      ...row,
      price: Number(row.price) || 0,
      image: row.image || row.image_url || "https://placehold.co/150x150?text=No+Image"
    }));
  } catch (error) {
    console.error("❌ ไม่สามารถอ่านไฟล์ Excel ได้:", error.message);
    return [];
  }
}

let products = loadProducts();

// F01, F03, F08 (P02, P04): ค้นหา, กรอง และเรียงลำดับ Hardware
app.get("/api/products", (req, res) => {
  let result = [...products];
  const { search, category, brand, minPrice, maxPrice, sort } = req.query;

  if (search) {
    const q = search.toLowerCase();
    result = result.filter(p =>
      [p.name, p.brand, p.category, p.description, p.product_id]
        .some(v => String(v || "").toLowerCase().includes(q))
    );
  }

  if (category && category !== "All") {
    result = result.filter(p => p.category === category);
  }

  if (brand && brand !== "All") {
    result = result.filter(p => p.brand === brand);
  }

  if (minPrice !== undefined && minPrice !== "") {
    result = result.filter(p => p.price >= Number(minPrice));
  }

  if (maxPrice !== undefined && maxPrice !== "") {
    result = result.filter(p => p.price <= Number(maxPrice));
  }

  if (sort === "price-asc") result.sort((a, b) => a.price - b.price);
  if (sort === "price-desc") result.sort((a, b) => b.price - a.price);
  if (sort === "name-asc") result.sort((a, b) => a.name.localeCompare(b.name));

  res.json({ total: result.length, products: result });
});

// F02 (P03): ดูรายละเอียด Hardware รายชิ้น
app.get("/api/products/:id", (req, res) => {
  const product = products.find(p => String(p.product_id) === String(req.params.id));
  if (!product) return res.status(404).json({ message: "ไม่พบสินค้า" });
  res.json(product);
});

// ดึงหมวดหมู่ทั้งหมด
app.get("/api/categories", (req, res) => {
  res.json([...new Set(products.map(p => p.category).filter(Boolean))].sort());
});

// ดึงแบรนด์ทั้งหมด
app.get("/api/brands", (req, res) => {
  res.json([...new Set(products.map(p => p.brand).filter(Boolean))].sort());
});

// (P01): สถิติระบบภาพรวม
app.get("/api/stats", (req, res) => {
  const categories = {};
  products.forEach(p => {
    if (p.category) categories[p.category] = (categories[p.category] || 0) + 1;
  });
  res.json({ 
    totalProducts: products.length, 
    categories, 
    brands: [...new Set(products.map(p => p.brand))].length 
  });
});

// F10 (P06): ระบบ Recommendation อัตโนมัติตามงบประมาณ
app.post("/api/recommend", (req, res) => {
  const budget = Number(req.body.budget) || 0;
  const selected = [];
  const preferredCategories = ["CPU", "Motherboard", "Mainboard", "RAM", "GPU", "Storage", "SSD", "PSU", "Case"];

  for (const category of preferredCategories) {
    const candidates = products
      .filter(p => p.category === category)
      .sort((a, b) => a.price - b.price);

    if (!candidates.length || selected.some(s => s.category === category)) continue;

    const affordable = candidates.filter(p => 
      selected.reduce((sum, s) => sum + s.price, 0) + p.price <= budget
    );

    if (affordable.length) {
      // เลือกชิ้นที่ราคาสูงที่สุดในงบที่เหลือเพื่อให้ได้สเปกคุ้มค่าที่สุด
      selected.push(affordable[affordable.length - 1]);
    }
  }

  const total = selected.reduce((sum, p) => sum + p.price, 0);
  res.json({ budget, total, remaining: Math.max(0, budget - total), products: selected });
});

// Routing สำหรับแยกหน้า HTML อิสระ (Multi-page Support)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/products.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "products.html"));
});

app.get("/builder.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "builder.html"));
});

app.get("/favorites.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "favorites.html"));
});

app.get("/about.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "about.html"));
});

// ดักจับหน้าอื่นๆ ที่ไม่มีอยู่ (Fallback สำหรับ Express v5)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 PC Advisor running at http://localhost:${PORT}`);
});