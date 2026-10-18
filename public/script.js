import { auth, db, rtdb } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { get, ref } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

const $ = id => document.getElementById(id);
let currentProducts = [];
const legacyFavorites = localStorage.getItem("pc_favorites");
if (!localStorage.getItem("pc_favorites_guest") && legacyFavorites) {
  localStorage.setItem("pc_favorites_guest", legacyFavorites);
}
localStorage.removeItem("pc_favorites");
let favorites = storedFavorites("pc_favorites_guest");
let compareList = JSON.parse(localStorage.getItem("pc_compare")) || [];
let currentUser = null;

const fmt = n => new Intl.NumberFormat("th-TH").format(Number(n || 0));

let catalogCache;

async function getCatalog() {
  if (catalogCache) return catalogCache;

  const [productsSnapshot, categoriesSnapshot, brandsSnapshot] = await Promise.all([
    get(ref(rtdb, "products")),
    get(ref(rtdb, "categories")),
    get(ref(rtdb, "brands"))
  ]);

  if (!productsSnapshot.exists()) throw new Error("ไม่พบข้อมูลสินค้าใน Firebase Realtime Database");
  const rawProducts = productsSnapshot.val();
  const products = Object.entries(rawProducts).map(([id, product]) => ({
    ...product,
    product_id: product.product_id || id,
    category: product.category || product.category_id || "",
    brand: product.brand || product.brand_id || "",
    image: product.image || product.image_url || "https://placehold.co/150x150?text=No+Image"
  }));
  const categories = Object.values(categoriesSnapshot.val() || {}).map(item => item.name || item);
  const brands = Object.values(brandsSnapshot.val() || {}).map(item => item.name || item);

  catalogCache = { products, categories, brands };
  return catalogCache;
}

async function api(url, options) {
  if (url.startsWith("/api/recommend")) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error("เกิดข้อผิดพลาด");
    return res.json();
  }

  const catalog = await getCatalog();
  if (url === "/api/categories") return catalog.categories;
  if (url === "/api/brands") return catalog.brands;
  if (url === "/api/stats") {
    const categories = {};
    for (const product of catalog.products) {
      if (product.category) categories[product.category] = (categories[product.category] || 0) + 1;
    }
    return { totalProducts: catalog.products.length, categories, brands: catalog.brands.length };
  }

  const detailMatch = url.match(/^\/api\/products\/([^?]+)$/);
  if (detailMatch) {
    const product = catalog.products.find(item => String(item.product_id) === decodeURIComponent(detailMatch[1]));
    if (!product) throw new Error("ไม่พบสินค้า");
    return product;
  }

  if (url.startsWith("/api/products")) {
    const params = new URLSearchParams(url.split("?")[1] || "");
    let products = [...catalog.products];
    const search = params.get("search")?.toLowerCase();
    const category = params.get("category");
    const brand = params.get("brand");
    const minPrice = params.get("minPrice");
    const maxPrice = params.get("maxPrice");
    const sort = params.get("sort");

    if (search) products = products.filter(product =>
      [product.name, product.brand, product.category, product.description, product.product_id]
        .some(value => String(value || "").toLowerCase().includes(search))
    );
    if (category && category !== "All") products = products.filter(product => product.category === category);
    if (brand && brand !== "All") products = products.filter(product => product.brand === brand);
    if (minPrice !== null && minPrice !== "") products = products.filter(product => Number(product.price) >= Number(minPrice));
    if (maxPrice !== null && maxPrice !== "") products = products.filter(product => Number(product.price) <= Number(maxPrice));
    if (sort === "price-asc") products.sort((a, b) => Number(a.price) - Number(b.price));
    if (sort === "price-desc") products.sort((a, b) => Number(b.price) - Number(a.price));
    if (sort === "name-asc") products.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return { total: products.length, products };
  }

  throw new Error("ไม่พบข้อมูลที่ร้องขอ");
}

// F01, F04, F06: การแสดงผลการ์ดสินค้าพร้อมปุ่มรายการโปรดและเปรียบเทียบ
function productCard(product) {
  const isFav = favorites.includes(product.product_id);
  const isComp = compareList.includes(product.product_id);
  return `
    <div class="product-card card" data-id="${product.product_id}" style="border: 1px solid #ddd; padding: 15px; border-radius: 8px; background: #fff; cursor: pointer; transition: 0.2s; position: relative;">
      <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 5px;">
        <button onclick="toggleFavorite('${product.product_id}', event)" style="background: ${isFav ? '#ff4757' : '#eee'}; color: ${isFav ? '#fff' : '#333'}; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer;" title="รายการโปรด">❤️</button>
        <button onclick="toggleCompare('${product.product_id}', event)" style="background: ${isComp ? '#2ed573' : '#eee'}; color: ${isComp ? '#fff' : '#333'}; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer;" title="เปรียบเทียบ">⚖️</button>
      </div>
      <img src="${product.image}" alt="${product.name}" style="width: 150px; height: 150px; object-fit: contain; display: block; margin: 0 auto;" onerror="this.src='https://placehold.co/150x150?text=No+Image'">
      <div class="product-info" style="margin-top: 10px;">
        <span style="font-size: 0.75rem; background: #007bff; color: #fff; padding: 2px 6px; border-radius: 3px;">${product.category}</span>
        <h3 style="margin: 5px 0; font-size: 1rem;">${product.name}</h3>
        <p style="color: #666; font-size: 0.9rem;">แบรนด์: ${product.brand || '-'}</p>
        <p style="color: #e74c3c; font-weight: bold; font-size: 1.1rem;">ราคา: ฿${fmt(product.price)}</p>
      </div>
    </div>
  `;
}

// F01, F03, F08: โหลดข้อมูลเฉพาะหน้าสินค้า (products.html)
async function loadProducts() {
  const grid = $("productsGrid");
  if (!grid) return; 

  const params = new URLSearchParams();
  ["search","category","brand","minPrice","maxPrice","sort"].forEach(key => {
    if ($(key)) {
      const value = $(key).value;
      if (value && value !== "All") params.set(key, value);
    }
  });

  grid.innerHTML = `<p style='grid-column: 1/-1; text-align: center; color: #666;'>⏳ กำลังโหลดข้อมูลฮาร์ดแวร์...</p>`;

  try {
    const data = await api("/api/products?" + params.toString());
    currentProducts = data.products;
    
    if ($("resultCount")) $("resultCount").textContent = `พบ ${data.total} รายการ`;
    
    grid.innerHTML = data.products.length
      ? data.products.map(productCard).join("")
      : `<p style="grid-column: 1 / -1; text-align: center; color: #888;">📦 ไม่พบสินค้าที่ตรงกับเงื่อนไข</p>`;
    
    document.querySelectorAll(".card").forEach(card =>
      card.addEventListener("click", () => showProduct(card.dataset.id))
    );
  } catch (err) {
    console.error(err);
    grid.innerHTML = "<p style='grid-column: 1/-1; text-align: center; color: #e74c3c;'>❌ ไม่สามารถโหลดข้อมูลสินค้าได้ (Error)</p>";
  }
}

// F02 & F07: ดูรายละเอียด Hardware และแสดงอุปกรณ์ที่เกี่ยวข้อง
async function showProduct(id) {
  try {
    const p = await api("/api/products/" + id);
    const fields = [
      ["รหัสสินค้า", p.product_id], ["ชื่อสินค้า", p.name], ["แบรนด์", p.brand],
      ["ประเภท", p.category], ["ราคา", "฿" + fmt(p.price)], ["Socket", p.socket],
      ["Cores", p.cores], ["Threads", p.threads], ["RAM Type", p.ram_type],
      ["Power Consumption", p.power_consumption], ["รายละเอียด", p.description]
    ];
    
    const related = currentProducts.filter(item => item.category === p.category && item.product_id !== p.product_id).slice(0, 3);
    
    if ($("modalContent")) {
      $("modalContent").innerHTML = `
        <img src="${p.image}" alt="${p.name}" style="width: 120px; height: 120px; object-fit: contain; display: block; margin: 0 auto 15px;" onerror="this.src='https://placehold.co/120x120?text=No+Image'">
        <span class="tag" style="font-size: 0.75rem; background: #007bff; color: #fff; padding: 2px 6px; border-radius: 3px;">${p.category}</span>
        <h2>${p.name}</h2>
        <div class="price" style="color:#e74c3c; font-size:1.2rem; font-weight:bold; margin-bottom:10px;">฿${fmt(p.price)}</div>
        <table class="detail-table" style="width:100%; border-collapse:collapse;">${fields.map(([k,v])=>`<tr><td style="border:1px solid #ddd; padding:6px; font-weight:bold;">${k}</td><td style="border:1px solid #ddd; padding:6px;">${v || "-"}</td></tr>`).join("")}</table>
        
        <hr style="margin: 20px 0;">
        <h4>อุปกรณ์ที่เกี่ยวข้อง (${p.category}):</h4>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px;">
          ${related.length ? related.map(r => `
            <div onclick="showProduct('${r.product_id}')" style="border: 1px solid #ddd; padding: 8px; border-radius: 4px; cursor: pointer; text-align: center; background: #fafafa;">
              <img src="${r.image}" style="width: 50px; height: 50px; object-fit: contain;" onerror="this.src='https://placehold.co/50x50?text=No+Image'">
              <div style="font-size: 0.8rem; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${r.name}</div>
              <div style="font-size: 0.8rem; color: #e74c3c;">฿${fmt(r.price)}</div>
            </div>
          `).join('') : '<p style="font-size:0.85rem; color:#888;">ไม่มีอุปกรณ์ที่เกี่ยวข้อง</p>'}
        </div>
      `;
    }
    if ($("modal")) $("modal").classList.remove("hidden");
  } catch (e) {
    console.error("ไม่สามารถแสดงรายละเอียดสินค้าได้", e);
  }
}

// F06: ระบบเพิ่ม/ลบรายการโปรด (Favorites)
function toggleFavorite(id, event) {
  if (event) event.stopPropagation();
  const index = favorites.indexOf(id);
  if (index > -1) {
    favorites.splice(index, 1);
  } else {
    favorites.push(id);
  }
  void persistFavorites();
  
  // อัปเดตการแสดงผลทันทีไม่ว่าจะอยู่หน้าไหน
  updateFavoritesSection();
  loadProducts();
}

function storedFavorites(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function persistFavorites() {
  const storageKey = currentUser ? `pc_favorites_${currentUser.uid}` : "pc_favorites_guest";
  localStorage.setItem(storageKey, JSON.stringify(favorites));
  if (!currentUser) return;

  try {
    await setDoc(doc(db, "users", currentUser.uid), {
      favorites,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error("บันทึกรายการโปรดไป Firebase ไม่สำเร็จ:", error);
  }
}

async function loadUserFavorites(user) {
  const guestFavorites = storedFavorites("pc_favorites_guest");
  const localUserFavorites = storedFavorites(`pc_favorites_${user.uid}`);

  try {
    const snapshot = await getDoc(doc(db, "users", user.uid));
    const cloudFavorites = snapshot.exists() && Array.isArray(snapshot.data().favorites)
      ? snapshot.data().favorites
      : [];
    favorites = [...new Set([...cloudFavorites, ...localUserFavorites, ...guestFavorites])];
    localStorage.setItem("pc_favorites_guest", "[]");
    await persistFavorites();
  } catch (error) {
    console.error("โหลดรายการโปรดจาก Firebase ไม่สำเร็จ:", error);
    favorites = [...new Set([...localUserFavorites, ...guestFavorites])];
    localStorage.setItem(`pc_favorites_${user.uid}`, JSON.stringify(favorites));
  }
}

// แสดงผลสินค้าในหน้า favorites.html
async function updateFavoritesSection() {
  const grid = $("favoritesGrid");
  if (!grid) return;

  // ถ้ายังไม่มีข้อมูลสินค้า ให้ดึงมาก่อน
  if (currentProducts.length === 0) {
    const allData = await api("/api/products");
    currentProducts = allData.products;
  }

  const favProducts = currentProducts.filter(p => favorites.includes(p.product_id));
  grid.innerHTML = favProducts.length ? favProducts.map(productCard).join("") : `<p style="grid-column: 1/-1; color: #888; text-align: center;">ยังไม่มีสินค้าในรายการโปรด</p>`;
  
  grid.querySelectorAll(".card").forEach(card =>
    card.addEventListener("click", () => showProduct(card.dataset.id))
  );
}

// F04: ระบบเปรียบเทียบ Hardware (Compare Tray & Modal)
function toggleCompare(id, event) {
  if (event) event.stopPropagation();
  const index = compareList.indexOf(id);
  if (index > -1) {
    compareList.splice(index, 1);
  } else {
    if (compareList.length >= 3) {
      alert("เปรียบเทียบได้สูงสุดครั้งละ 3 รายการเท่านั้น");
      return;
    }
    compareList.push(id);
  }
  localStorage.setItem("pc_compare", JSON.stringify(compareList));
  loadProducts();
  updateCompareTray();
}

function updateCompareTray() {
  const tray = $("compareTray");
  if (!tray) return;

  if (compareList.length === 0) {
    tray.style.display = "none";
    return;
  }

  const compProducts = currentProducts.filter(p => compareList.includes(p.product_id));
  tray.style.display = "flex";
  const infoEl = $("compareInfo");
  if (infoEl) {
    infoEl.textContent = `เปรียบเทียบฮาร์ดแวร์ (${compareList.length}/3): ${compProducts.map(c => c.name).join(', ')}`;
  }
}

function clearCompare() {
  compareList = [];
  localStorage.removeItem("pc_compare");
  loadProducts();
  updateCompareTray();
}

function showComparisonModal() {
  const compProducts = currentProducts.filter(p => compareList.includes(p.product_id));
  let html = `<h2>ตารางเปรียบเทียบฮาร์ดแวร์</h2><table style="width:100%; border-collapse: collapse; margin-top: 15px;">`;
  html += `<tr style="background:#f1f1f1;"><th style="border:1px solid #ddd; padding:8px;">คุณสมบัติ</th>${compProducts.map(c => `<th style="border:1px solid #ddd; padding:8px;">${c.name}</th>`).join('')}</tr>`;
  html += `<tr><td style="border:1px solid #ddd; padding:8px; font-weight:bold;">ราคา</td>${compProducts.map(c => `<td style="border:1px solid #ddd; padding:8px; color:#e74c3c;">฿${fmt(c.price)}</td>`).join('')}</tr>`;
  html += `<tr><td style="border:1px solid #ddd; padding:8px; font-weight:bold;">แบรนด์</td>${compProducts.map(c => `<td style="border:1px solid #ddd; padding:8px;">${c.brand || '-'}</td>`).join('')}</tr>`;
  html += `<tr><td style="border:1px solid #ddd; padding:8px; font-weight:bold;">Socket</td>${compProducts.map(c => `<td style="border:1px solid #ddd; padding:8px;">${c.socket || '-'}</td>`).join('')}</tr>`;
  html += `<tr><td style="border:1px solid #ddd; padding:8px; font-weight:bold;">RAM Type</td>${compProducts.map(c => `<td style="border:1px solid #ddd; padding:8px;">${c.ram_type || '-'}</td>`).join('')}</tr>`;
  html += `</table>`;

  if ($("modalContent")) $("modalContent").innerHTML = html;
  if ($("modal")) $("modal").classList.remove("hidden");
}

// F09: ระบบสมาชิก (Member System UI & Control)
function updateMemberUI() {
  const userDisplay = $("userDisplay");
  const authBtn = $("authBtn");
  if (!userDisplay || !authBtn) return;

  if (currentUser) {
    userDisplay.textContent = `👤 ${currentUser.email || "สมาชิก"}`;
    authBtn.textContent = "ออกจากระบบ";
    authBtn.style.background = "#ff4757";
  } else {
    userDisplay.textContent = "Guest";
    authBtn.textContent = "เข้าสู่ระบบ";
    authBtn.style.background = "#007bff";
  }
}

function ensureAuthDialog() {
  let dialog = $("authDialog");
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = "authDialog";
  dialog.style.cssText = "border:0;border-radius:12px;padding:0;max-width:420px;width:calc(100% - 32px);box-shadow:0 20px 60px #0005";
  dialog.innerHTML = `
    <form id="authForm" style="padding:24px;display:grid;gap:14px;color:#222">
      <button id="closeAuth" type="button" aria-label="ปิด" style="justify-self:end;border:0;background:none;font-size:24px;cursor:pointer">×</button>
      <h2 id="authTitle" style="margin:0">เข้าสู่ระบบ</h2>
      <label>อีเมล<input id="authEmail" type="email" required autocomplete="email" style="display:block;width:100%;box-sizing:border-box;padding:10px;margin-top:5px"></label>
      <label>รหัสผ่าน<input id="authPassword" type="password" required minlength="6" autocomplete="current-password" style="display:block;width:100%;box-sizing:border-box;padding:10px;margin-top:5px"></label>
      <p id="authMessage" role="status" style="margin:0;color:#c0392b"></p>
      <button id="authSubmit" type="submit" style="padding:10px;background:#007bff;color:#fff;border:0;border-radius:6px;cursor:pointer">เข้าสู่ระบบ</button>
      <button id="authModeToggle" type="button" style="padding:8px;border:0;background:none;color:#007bff;cursor:pointer">ยังไม่มีบัญชี? สมัครสมาชิก</button>
    </form>`;
  document.body.appendChild(dialog);

  let mode = "signin";
  const form = $("authForm");
  $("closeAuth").addEventListener("click", () => dialog.close());
  $("authModeToggle").addEventListener("click", () => {
    mode = mode === "signin" ? "signup" : "signin";
    $("authTitle").textContent = mode === "signin" ? "เข้าสู่ระบบ" : "สมัครสมาชิก";
    $("authSubmit").textContent = mode === "signin" ? "เข้าสู่ระบบ" : "สร้างบัญชี";
    $("authModeToggle").textContent = mode === "signin" ? "ยังไม่มีบัญชี? สมัครสมาชิก" : "มีบัญชีแล้ว? เข้าสู่ระบบ";
    $("authPassword").autocomplete = mode === "signin" ? "current-password" : "new-password";
    $("authMessage").textContent = "";
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    const submit = $("authSubmit");
    submit.disabled = true;
    $("authMessage").textContent = "กำลังเชื่อมต่อ...";
    try {
      if (mode === "signup") await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
      dialog.close();
      form.reset();
    } catch (error) {
      const messages = {
        "auth/email-already-in-use": "อีเมลนี้มีบัญชีแล้ว",
        "auth/invalid-email": "รูปแบบอีเมลไม่ถูกต้อง",
        "auth/weak-password": "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร",
        "auth/invalid-credential": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        "auth/operation-not-allowed": "กรุณาเปิด Email/Password ใน Firebase Authentication ก่อน"
      };
      $("authMessage").textContent = messages[error.code] || "เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง";
    } finally {
      submit.disabled = false;
    }
  });
  return dialog;
}

function toggleAuth() {
  if (currentUser) {
    void signOut(auth);
    return;
  }
  ensureAuthDialog().showModal();
}

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) await loadUserFavorites(user);
  else favorites = storedFavorites("pc_favorites_guest").length
    ? storedFavorites("pc_favorites_guest")
    : storedFavorites("pc_favorites");
  updateMemberUI();
  if ($("productsGrid")) await loadProducts();
  if ($("favoritesGrid")) await updateFavoritesSection();
});

// ฟังก์ชันเริ่มต้นทำงานหลัก (แยกตามหน้า HTML ที่เปิดอยู่)
async function init() {
  try {
    // โหลดข้อมูลภาพรวมสำหรับหน้า index.html
    if ($("totalProducts") || $("categoryChips")) {
      const [categories, brands, stats] = await Promise.all([
        api("/api/categories"), api("/api/brands"), api("/api/stats")
      ]);
      if ($("totalProducts")) $("totalProducts").textContent = stats.totalProducts + " รายการ";
      if ($("categoryChips")) {
        $("categoryChips").innerHTML = Object.entries(stats.categories)
          .slice(0,6).map(([k,v])=>`<span class="chip">${k} ${v}</span>`).join("");
      }
    }

    // โหลดข้อมูลสำหรับหน้า products.html
    if ($("productsGrid")) {
      const [categories, brands] = await Promise.all([
        api("/api/categories"), api("/api/brands")
      ]);
      if ($("category")) categories.forEach(v => $("category").insertAdjacentHTML("beforeend", `<option>${v}</option>`));
      if ($("brand")) brands.forEach(v => $("brand").insertAdjacentHTML("beforeend", `<option>${v}</option>`));
      
      const allData = await api("/api/products");
      currentProducts = allData.products;
      await loadProducts();
    }

    // โหลดข้อมูลสำหรับหน้า favorites.html
    if ($("favoritesGrid")) {
      await updateFavoritesSection();
    }
    
    updateMemberUI();
    updateCompareTray();
  } catch (err) {
    console.error("Initialization Error:", err);
  }
}

let timer;
["search","category","brand","minPrice","maxPrice","sort"].forEach(id => {
  if ($(id)) {
    $(id).addEventListener("input", () => {
      clearTimeout(timer); timer = setTimeout(loadProducts, 250);
    });
    $(id).addEventListener("change", loadProducts);
  }
});

if ($("clearFilters")) {
  $("clearFilters").addEventListener("click", () => {
    ["search","minPrice","maxPrice"].forEach(id => { if($(id)) $(id).value = ""; });
    ["category","brand","sort"].forEach(id => { if($(id)) $(id).value = id === "sort" ? "" : "All"; });
    loadProducts();
  });
}

if ($("closeModal")) {
  $("closeModal").onclick = () => $("modal").classList.add("hidden");
}
if ($("modal")) {
  $("modal").onclick = e => { if(e.target.id === "modal") $("modal").classList.add("hidden"); };
}

// F10 & F11: ระบบแนะนำสเปกอัตโนมัติพร้อมตรวจสอบ Compatibility (สำหรับหน้า builder.html)
if ($("recommendBtn")) {
  $("recommendBtn").addEventListener("click", async () => {
    const budgetInput = $("budget");
    if (!budgetInput) return;
    const budget = Number(budgetInput.value);
    
    if (!budget || budget <= 0) return alert("กรุณาระบุงบประมาณ");
    const data = await api("/api/recommend", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({budget})
    });
    
    let compatStatus = "✅ อุปกรณ์เข้ากันได้ทั้งหมด (Compatible)";
    let compatClass = "success";
    
    const productsList = data.products || [];
    const cpu = productsList.find(p => p.category === 'CPU');
    const mb = productsList.find(p => p.category === 'Motherboard' || p.category === 'Mainboard');
    if (cpu && mb && cpu.socket && mb.socket && cpu.socket !== mb.socket) {
      compatStatus = `⚠️ คำเตือน: Socket ของ CPU (${cpu.socket}) และ Mainboard (${mb.socket}) ไม่ตรงกัน`;
      compatClass = "error";
    }

    if ($("recommendResult")) {
      $("recommendResult").innerHTML = `<div class="recommend-card" style="margin-top:20px; padding:15px; border:1px solid #ddd; border-radius:8px; background:#f9f9f9;">
        <h3>สเปกที่แนะนำ • รวม ฿${fmt(data.total)} / งบ ฿${fmt(data.budget)}</h3>
        <p>งบประมาณคงเหลือ ฿${fmt(data.remaining)}</p>
        <div style="margin: 10px 0; padding: 8px; border-radius: 4px; background: ${compatClass === 'success' ? '#e8f8f5' : '#fdedec'}; color: ${compatClass === 'success' ? '#27ae60' : '#c0392b'}; font-weight: bold;">
          ${compatStatus}
        </div>
        <div class="recommend-items" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 15px;">${data.products.map(p =>
          `<div class="recommend-item" style="background:#fff; padding:10px; border-radius:6px; border:1px solid #eee; text-align:center;">
             <img src="${p.image}" alt="${p.name}" style="width: 60px; height: 60px; object-fit: contain; display: block; margin: 0 auto 5px;" onerror="this.src='https://placehold.co/60x60?text=No+Image'">
             <span class="tag" style="font-size:0.7rem; background:#007bff; color:#fff; padding:2px 4px; border-radius:3px;">${p.category}</span><br>
             <b style="font-size:0.85rem; display:block; margin:5px 0;">${p.name}</b>
             <span style="color:#e74c3c; font-weight:bold;">฿${fmt(p.price)}</span>
           </div>`
        ).join("") || "<p>ไม่สามารถจัดสเปกจากงบประมาณนี้ได้</p>"}</div>
      </div>`;
    }
  });
}

Object.assign(window, {
  clearCompare,
  showComparisonModal,
  showProduct,
  toggleAuth,
  toggleCompare,
  toggleFavorite
});

init();
