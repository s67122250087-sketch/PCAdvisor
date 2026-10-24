import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { onValue, push, ref, remove, serverTimestamp as databaseServerTimestamp, set, update } from "firebase/database";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, database, firestore } from "./firebase.js";
import { imageFiles } from "./imageFiles.js";

const pages = [
  ["/", "หน้าแรก"],
  ["/products.html", "สินค้า"],
  ["/builder.html", "จัดสเปก"],
  ["/favorites.html", "รายการโปรด"],
  ["/report.html", "แจ้งปัญหา"]
];
const ADMIN_PATH = "/admin.html";
const FALLBACK_IMAGE = "/image/no-image.svg";
const PRODUCT_FIELDS = [
  ["product_id", "รหัสสินค้า"], ["name", "ชื่อสินค้า"], ["category", "หมวดหมู่"],
  ["brand", "ยี่ห้อ"], ["price", "ราคา (บาท)"], ["image", "ลิงก์รูปภาพ"],
  ["socket", "Socket"], ["cores", "จำนวน Core"], ["threads", "จำนวน Thread"],
  ["ram_type", "ชนิด RAM"], ["power_consumption", "การใช้พลังงาน"]
];
const money = value => new Intl.NumberFormat("th-TH").format(Number(value || 0));
const readArray = key => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

function normalizeProducts(value) {
  return Object.entries(value || {}).map(([id, item]) => ({
    ...item,
    databaseKey: id,
    sourceData: item,
    product_id: item.product_id || id,
    category: item.category || item.category_id || "",
    brand: item.brand || item.brand_id || "",
    image: normalizeImage(item.image || item.image_url)
  }));
}

function normalizeImage(value) {
  const image = String(value || "").trim();
  if (!image) return FALLBACK_IMAGE;
  if (/^https?:\/\//i.test(image)) return image;
  const cleanPath = image.split(/[?#]/)[0].replace(/\\/g, "/");
  const filename = cleanPath.split("/").filter(Boolean).pop();
  const actualFilename = filename && imageFiles[filename.toLowerCase()];
  return actualFilename ? `/image/${encodeURIComponent(actualFilename)}` : FALLBACK_IMAGE;
}

function useFallbackImage(event) {
  event.currentTarget.onerror = null;
  event.currentTarget.src = FALLBACK_IMAGE;
}

export default function App() {
  const pathname = window.location.pathname;
  const page = [...pages.map(([path]) => path), ADMIN_PATH].includes(pathname) ? pathname : "/";
  const [products, setProducts] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCheckReady, setAdminCheckReady] = useState(false);
  const [adminCheckError, setAdminCheckError] = useState("");
  const [adminValue, setAdminValue] = useState(null);
  const [favorites, setFavorites] = useState(() => {
    const old = localStorage.getItem("pc_favorites");
    if (!localStorage.getItem("pc_favorites_guest") && old) localStorage.setItem("pc_favorites_guest", old);
    return readArray("pc_favorites_guest");
  });
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [favoritesOwner, setFavoritesOwner] = useState(null);
  const [compareList, setCompareList] = useState(() => readArray("pc_compare"));
  const [authDialog, setAuthDialog] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authError, setAuthError] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [compareDialog, setCompareDialog] = useState(false);

  useEffect(() => onAuthStateChanged(auth, nextUser => { setUser(nextUser); if (nextUser) setAdminCheckReady(false); setAuthReady(true); }), []);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setAdminCheckError("");
      setAdminValue(null);
      setAdminCheckReady(true);
      return;
    }
    setAdminCheckReady(false);
    setAdminCheckError("");
    return onValue(ref(database, `admins/${user.uid}`), snapshot => {
      const value = snapshot.val();
      setAdminValue(value);
      setIsAdmin(value === true);
      setAdminCheckError("");
      setAdminCheckReady(true);
    }, error => {
      console.error("ตรวจสอบสิทธิ์ผู้ดูแลไม่สำเร็จ:", error);
      setIsAdmin(false);
      setAdminValue(null);
      setAdminCheckError(error.code || "database/permission-denied");
      setAdminCheckReady(true);
    });
  }, [user]);

  useEffect(() => {
    const productsRef = ref(database, "products");
    const unsubscribe = onValue(productsRef, snapshot => {
      if (!snapshot.exists()) {
        setProducts([]);
        setCatalogError("ไม่พบข้อมูลสินค้าใน Firebase Realtime Database");
      } else {
        setProducts(normalizeProducts(snapshot.val()));
        setCatalogError("");
      }
      setCatalogLoading(false);
    }, error => {
      setCatalogError("อ่านข้อมูลสินค้าไม่ได้ กรุณาตรวจสอบ Database Rules");
      setCatalogLoading(false);
      console.error("Firebase Realtime Database:", error);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let active = true;
    const userKey = user ? `pc_favorites_${user.uid}` : "pc_favorites_guest";
    setFavoritesReady(false);
    const loadFavorites = async () => {
      const local = readArray(userKey);
      if (!user) {
        if (active) setFavorites(local);
      } else {
        try {
          const snapshot = await getDoc(doc(firestore, "users", user.uid));
          const cloud = snapshot.exists() && Array.isArray(snapshot.data().favorites) ? snapshot.data().favorites : [];
          const guest = readArray("pc_favorites_guest");
          const merged = [...new Set([...cloud, ...local, ...guest])];
          if (active) setFavorites(merged);
          localStorage.setItem("pc_favorites_guest", "[]");
          await setDoc(doc(firestore, "users", user.uid), { favorites: merged, updatedAt: serverTimestamp() }, { merge: true });
        } catch (error) {
          console.error("โหลดรายการโปรดจาก Firestore ไม่สำเร็จ:", error);
          if (active) setFavorites([...new Set([...local, ...readArray("pc_favorites_guest")])]);
        }
      }
      if (active) setFavoritesReady(true);
      if (active) setFavoritesOwner(user ? user.uid : "guest");
    };
    loadFavorites();
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!favoritesReady || favoritesOwner !== (user ? user.uid : "guest")) return;
    localStorage.setItem(user ? `pc_favorites_${user.uid}` : "pc_favorites_guest", JSON.stringify(favorites));
    if (user) {
      setDoc(doc(firestore, "users", user.uid), { favorites, updatedAt: serverTimestamp() }, { merge: true })
        .catch(error => console.error("บันทึกรายการโปรดไป Firestore ไม่สำเร็จ:", error));
    }
  }, [favorites, favoritesReady, favoritesOwner, user]);

  useEffect(() => localStorage.setItem("pc_compare", JSON.stringify(compareList)), [compareList]);

  const categories = useMemo(() => [...new Set(products.map(item => item.category).filter(Boolean))].sort(), [products]);
  const brands = useMemo(() => [...new Set(products.map(item => item.brand).filter(Boolean))].sort(), [products]);

  const toggleFavorite = productId => setFavorites(current => current.includes(productId)
    ? current.filter(id => id !== productId)
    : [...current, productId]);

  const toggleCompare = productId => setCompareList(current => {
    if (current.includes(productId)) return current.filter(id => id !== productId);
    if (current.length >= 3) {
      window.alert("เปรียบเทียบได้สูงสุดครั้งละ 3 รายการเท่านั้น");
      return current;
    }
    return [...current, productId];
  });

  async function submitAuth(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setAuthError("");
    try {
      const email = String(form.get("email")).trim();
      const password = String(form.get("password"));
      if (authMode === "signup") await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
      setAuthDialog(false);
    } catch (error) {
      const messages = {
        "auth/email-already-in-use": "อีเมลนี้มีบัญชีแล้ว",
        "auth/invalid-email": "รูปแบบอีเมลไม่ถูกต้อง",
        "auth/weak-password": "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร",
        "auth/invalid-credential": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        "auth/operation-not-allowed": "กรุณาเปิด Email/Password ใน Firebase Authentication ก่อน"
      };
      setAuthError(messages[error.code] || "เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
  }

  return <>
    <Header page={page} user={user} authReady={authReady} isAdmin={isAdmin} adminCheckReady={adminCheckReady} adminCheckError={adminCheckError} onAuth={() => user ? signOut(auth) : setAuthDialog(true)} />
    <main>
      {page === "/" && <HomePage products={products} categories={categories} loading={catalogLoading} />}
      {page === "/products.html" && <ProductsPage products={products} categories={categories} brands={brands} favorites={favorites} compareList={compareList} loading={catalogLoading} error={catalogError} onFavorite={toggleFavorite} onCompare={toggleCompare} onSelect={setSelectedProduct} />}
      {page === "/builder.html" && <BuilderPage />}
      {page === "/favorites.html" && <FavoritesPage products={products} favorites={favorites} loading={catalogLoading} error={catalogError} onFavorite={toggleFavorite} onCompare={toggleCompare} compareList={compareList} onSelect={setSelectedProduct} />}
      {page === "/report.html" && <ReportPage user={user} onLogin={() => { setAuthMode("signin"); setAuthDialog(true); }} />}
      {page === ADMIN_PATH && <AdminPage user={user} isAdmin={isAdmin} adminCheckReady={adminCheckReady} adminCheckError={adminCheckError} adminValue={adminValue} products={products} />}
    </main>
    <Footer />
    {selectedProduct && <ProductDialog product={selectedProduct} products={products} onClose={() => setSelectedProduct(null)} onSelect={setSelectedProduct} />}
    {compareList.length > 0 && <CompareTray products={products} compareList={compareList} onView={() => setCompareDialog(true)} onClear={() => setCompareList([])} />}
    {compareDialog && <CompareDialog products={products.filter(item => compareList.includes(item.product_id))} onClose={() => setCompareDialog(false)} />}
    {authDialog && <AuthDialog mode={authMode} error={authError} onMode={() => { setAuthMode(value => value === "signin" ? "signup" : "signin"); setAuthError(""); }} onClose={() => setAuthDialog(false)} onSubmit={submitAuth} />}
  </>;
}

function Header({ page, user, authReady, isAdmin, adminCheckReady, adminCheckError, onAuth }) {
  const accountRole = !authReady ? "กำลังตรวจสอบบัญชี" : !user ? "ผู้เยี่ยมชม" : !adminCheckReady ? "กำลังตรวจสอบสิทธิ์" : adminCheckError ? "อ่านสิทธิ์แอดมินไม่ได้" : isAdmin ? "แอดมิน" : "ผู้ใช้ทั่วไป";
  return <header><div className="nav">
    <a className="logo" href="/" aria-label="PC Advisor หน้าแรก"><img src="/logo01.png" alt="PC Advisor Logo" /></a>
    <nav>{pages.map(([path, label]) => <a key={path} href={path} className={page === path ? "active" : ""}>{label}</a>)}</nav>
    <div className="member-area">{user ? <span className="account-email">👤 {user.email || "สมาชิก"}</span> : <span className="account-email header-slot" aria-hidden="true" />}<span className={`account-role ${isAdmin ? "admin-role" : ""}`} aria-live="polite">{accountRole}</span>{isAdmin ? <a className="admin-link" href={ADMIN_PATH}>จัดการระบบ</a> : <span className="admin-link-slot" aria-hidden="true" />}<button className="auth-button" onClick={onAuth}>{user ? "ออกจากระบบ" : "เข้าสู่ระบบ"}</button></div>
  </div></header>;
}

function Footer() { return <footer>© PC Advisor · ตัวช่วยเลือกอุปกรณ์คอมพิวเตอร์</footer>; }

function HomePage({ products, categories, loading }) {
  const counts = categories.map(category => [category, products.filter(item => item.category === category).length]);
  return <section className="hero"><div>
    <span className="pill">เลือกอุปกรณ์คอมได้ง่ายขึ้น</span>
    <h1>ค้นหาอุปกรณ์ PC<br /><span>ง่าย รวดเร็ว ในที่เดียว</span></h1>
    <p>ค้นหาและเปรียบเทียบอุปกรณ์คอมพิวเตอร์ พร้อมเลือกชิ้นส่วนให้เหมาะกับงบประมาณและการใช้งาน</p>
    <a className="btn" href="/products.html">เริ่มค้นหาสินค้า →</a>
  </div><div className="hero-card">
    <div className="pc-icon">🖥️</div><h3>{loading ? "กำลังโหลด..." : `${products.length} รายการ`}</h3><p>รายการอุปกรณ์ในระบบ</p>
    <div className="chips">{counts.slice(0, 6).map(([category, count]) => <span className="chip" key={category}>{category} {count}</span>)}</div>
  </div></section>;
}

function ProductsPage({ products, categories, brands, favorites, compareList, loading, error, onFavorite, onCompare, onSelect }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [brand, setBrand] = useState("All");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("");
  const filtered = useMemo(() => {
    let result = [...products];
    const q = search.trim().toLowerCase();
    if (q) result = result.filter(p => [p.name, p.brand, p.category, p.description, p.product_id].some(v => String(v || "").toLowerCase().includes(q)));
    if (category !== "All") result = result.filter(p => p.category === category);
    if (brand !== "All") result = result.filter(p => p.brand === brand);
    if (minPrice !== "") result = result.filter(p => Number(p.price) >= Number(minPrice));
    if (maxPrice !== "") result = result.filter(p => Number(p.price) <= Number(maxPrice));
    if (sort === "price-asc") result.sort((a, b) => Number(a.price) - Number(b.price));
    if (sort === "price-desc") result.sort((a, b) => Number(b.price) - Number(a.price));
    if (sort === "name-asc") result.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return result;
  }, [products, search, category, brand, minPrice, maxPrice, sort]);
  const clear = () => { setSearch(""); setCategory("All"); setBrand("All"); setMinPrice(""); setMaxPrice(""); setSort(""); };

  return <section className="section catalog-section"><div className="section-head"><div><p className="eyebrow">PRODUCT CATALOG</p><h2>ค้นหาและกรองอุปกรณ์</h2></div><span className="count">{loading ? "กำลังโหลด..." : `พบ ${filtered.length} รายการ`}</span></div>
    <div className="filters">
      <input aria-label="ค้นหาสินค้า" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 ค้นหาชื่อสินค้า แบรนด์ หรือรหัสสินค้า..." />
      <select aria-label="ประเภท" value={category} onChange={e => setCategory(e.target.value)}><option value="All">ทุกประเภท</option>{categories.map(item => <option key={item}>{item}</option>)}</select>
      <select aria-label="แบรนด์" value={brand} onChange={e => setBrand(e.target.value)}><option value="All">ทุกแบรนด์</option>{brands.map(item => <option key={item}>{item}</option>)}</select>
      <input aria-label="ราคาต่ำสุด" type="number" min="0" value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="ราคาต่ำสุด" />
      <input aria-label="ราคาสูงสุด" type="number" min="0" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="ราคาสูงสุด" />
      <select aria-label="เรียงลำดับ" value={sort} onChange={e => setSort(e.target.value)}><option value="">เรียงลำดับ</option><option value="price-asc">ราคาน้อย → มาก</option><option value="price-desc">ราคามาก → น้อย</option><option value="name-asc">ชื่อ A → Z</option></select>
      <button className="secondary" onClick={clear}>ล้างตัวกรอง</button>
    </div>
    {error && <p className="error-message">{error}</p>}
    {loading ? <p>กำลังโหลดข้อมูลฮาร์ดแวร์...</p> : <div className="grid">{filtered.map(product => <ProductCard key={product.product_id} product={product} favorite={favorites.includes(product.product_id)} compared={compareList.includes(product.product_id)} onFavorite={onFavorite} onCompare={onCompare} onSelect={onSelect} />)}</div>}
  </section>;
}

function ProductCard({ product, favorite, compared, onFavorite, onCompare, onSelect }) {
  const [favoriteFeedback, setFavoriteFeedback] = useState("");
  return <article className="card product-card" onClick={() => onSelect(product)}>
    <div className="card-actions"><button type="button" className={favorite ? "icon-button favorite-button selected-favorite" : "icon-button favorite-button"} aria-label={favorite ? "นำออกจากรายการโปรด" : "เพิ่มในรายการโปรด"} aria-pressed={favorite} title={favorite ? "นำออกจากรายการโปรด" : "เพิ่มในรายการโปรด"} onClick={e => { e.stopPropagation(); setFavoriteFeedback(favorite ? "นำออกจากรายการโปรดแล้ว" : "บันทึกในรายการโปรดแล้ว"); onFavorite(product.product_id); }}><span key={favorite ? "saved" : "unsaved"} className="favorite-icon" aria-hidden="true">{favorite ? "♥" : "♡"}</span><span className="sr-only" aria-live="polite">{favoriteFeedback}</span></button><button type="button" className={compared ? "icon-button compare-button selected-compare" : "icon-button compare-button"} aria-label={compared ? "นำออกจากรายการเปรียบเทียบ" : "เพิ่มเพื่อเปรียบเทียบ"} aria-pressed={compared} title={compared ? "นำออกจากรายการเปรียบเทียบ" : "เพิ่มเพื่อเปรียบเทียบ"} onClick={e => { e.stopPropagation(); onCompare(product.product_id); }}><span key={compared ? "compared" : "uncompared"} className="compare-icon" aria-hidden="true">⚖</span></button></div>
    <div className="product-image-stage"><img className="product-image" src={product.image} alt={product.name} onError={useFallbackImage} /></div>
    <div className="product-info"><span className="tag">{product.category}</span><h3>{product.name}</h3><p className="brand">แบรนด์: {product.brand || "-"}</p><p className="price">ราคา: ฿{money(product.price)}</p></div>
  </article>;
}

function FavoritesPage({ products, favorites, loading, error, ...cardProps }) {
  const favoriteProducts = products.filter(item => favorites.includes(item.product_id));
  return <section className="section"><div className="section-head"><div><p className="eyebrow">WISHLIST</p><h2>รายการโปรดของคุณ</h2></div></div>
    {error && <p className="error-message">{error}</p>}{loading ? <p>กำลังโหลด...</p> : favoriteProducts.length ? <div className="grid">{favoriteProducts.map(product => <ProductCard key={product.product_id} product={product} favorite onFavorite={cardProps.onFavorite} onCompare={cardProps.onCompare} compared={cardProps.compareList.includes(product.product_id)} onSelect={cardProps.onSelect} />)}</div> : <p className="empty-state">ยังไม่มีสินค้าในรายการโปรด</p>}
  </section>;
}

function ProductDialog({ product, products, onClose, onSelect }) {
  const fields = [["รหัสสินค้า", product.product_id], ["ชื่อสินค้า", product.name], ["แบรนด์", product.brand], ["ประเภท", product.category], ["ราคา", `฿${money(product.price)}`], ["Socket", product.socket], ["Cores", product.cores], ["Threads", product.threads], ["RAM Type", product.ram_type], ["Power Consumption", product.power_consumption], ["รายละเอียด", product.description]];
  const related = products.filter(item => item.category === product.category && item.product_id !== product.product_id).slice(0, 3);
  return <div className="modal" onClick={onClose}><div className="modal-box" onClick={e => e.stopPropagation()}><button className="close" onClick={onClose} aria-label="ปิด">×</button>
    <div className="product-image-stage dialog-image-stage"><img className="dialog-image" src={product.image} alt={product.name} onError={useFallbackImage} /></div><span className="tag">{product.category}</span><h2>{product.name}</h2><div className="price">฿{money(product.price)}</div>
    <table className="detail-table"><tbody>{fields.map(([key, value]) => <tr key={key}><td>{key}</td><td>{value || "-"}</td></tr>)}</tbody></table>
    <h3>อุปกรณ์ที่เกี่ยวข้อง ({product.category})</h3><div className="related-grid">{related.map(item => <button className="related-item" key={item.product_id} onClick={() => onSelect(item)}><span className="related-image-stage"><img src={item.image} alt="" onError={useFallbackImage} /></span><b>{item.name}</b><span>฿{money(item.price)}</span></button>)}</div>
  </div></div>;
}

function CompareTray({ products, compareList, onView, onClear }) {
  const compared = products.filter(item => compareList.includes(item.product_id));
  return <div className="compare-tray"><span>เปรียบเทียบฮาร์ดแวร์ ({compareList.length}/3): {compared.map(item => item.name).join(", ")}</span><div><button onClick={onView}>ดูตารางเปรียบเทียบ</button><button onClick={onClear}>ล้าง</button></div></div>;
}

function CompareDialog({ products, onClose }) {
  const rows = [["ราคา", item => `฿${money(item.price)}`], ["แบรนด์", item => item.brand || "-"], ["Socket", item => item.socket || "-"], ["RAM Type", item => item.ram_type || "-"]];
  return <div className="modal" onClick={onClose}><div className="modal-box compare-modal" onClick={e => e.stopPropagation()}><button className="close" onClick={onClose}>×</button><h2>ตารางเปรียบเทียบฮาร์ดแวร์</h2><div className="table-scroll"><table className="detail-table"><thead><tr><th>คุณสมบัติ</th>{products.map(item => <th key={item.product_id}>{item.name}</th>)}</tr></thead><tbody>{rows.map(([label, value]) => <tr key={label}><td>{label}</td>{products.map(item => <td key={item.product_id}>{value(item)}</td>)}</tr>)}</tbody></table></div></div></div>;
}

function AuthDialog({ mode, error, onMode, onClose, onSubmit }) {
  const signup = mode === "signup";
  return <div className="modal auth-overlay" onClick={onClose}><form className="modal-box auth-box" onClick={e => e.stopPropagation()} onSubmit={onSubmit}><button className="close" type="button" onClick={onClose}>×</button><h2>{signup ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}</h2>
    <label>อีเมล<input name="email" type="email" required autoComplete="email" /></label><label>รหัสผ่าน<input name="password" type="password" required minLength="6" autoComplete={signup ? "new-password" : "current-password"} /></label>
    {error && <p role="alert" className="error-message">{error}</p>}<button className="btn" type="submit">{signup ? "สร้างบัญชี" : "เข้าสู่ระบบ"}</button><button className="text-button" type="button" onClick={onMode}>{signup ? "มีบัญชีแล้ว? เข้าสู่ระบบ" : "ยังไม่มีบัญชี? สมัครสมาชิก"}</button>
  </form></div>;
}

function BuilderPage() {
  const [budget, setBudget] = useState("30000");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function recommend(event) {
    event.preventDefault();
    const amount = Number(budget);
    if (!amount || amount <= 0) { setError("กรุณาระบุงบประมาณ"); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget: amount }) });
      if (!response.ok) throw new Error("ขอคำแนะนำไม่สำเร็จ");
      setResult(await response.json());
    } catch (e) { setError("ไม่สามารถจัดสเปกได้ กรุณาลองอีกครั้ง"); }
    finally { setLoading(false); }
  }
  const cpu = result?.products?.find(item => item.category === "CPU");
  const board = result?.products?.find(item => ["Motherboard", "Mainboard"].includes(item.category));
  const incompatible = cpu?.socket && board?.socket && cpu.socket !== board.socket;
  return <section className="recommend section"><p className="eyebrow">PC BUILD ASSISTANT</p><h2>ช่วยจัดสเปกตามงบประมาณ</h2><p>ระบบเลือกอุปกรณ์ให้เหมาะกับงบ และตรวจสอบความเข้ากันได้เบื้องต้น</p>
    <form className="budget-box" onSubmit={recommend}><input type="number" min="1" value={budget} onChange={e => setBudget(e.target.value)} placeholder="ระบุงบประมาณ" /><button className="btn" disabled={loading}>{loading ? "กำลังจัดสเปก..." : "แนะนำสเปก"}</button></form>
    {error && <p role="alert" className="error-message">{error}</p>}{result && <div className="recommend-card"><h3>สเปกที่แนะนำ • รวม ฿{money(result.total)} / งบ ฿{money(result.budget)}</h3><p>งบประมาณคงเหลือ ฿{money(result.remaining)}</p>
      <p className={incompatible ? "compatibility-warning" : "compatibility-ok"}>{incompatible ? `⚠️ Socket ของ CPU (${cpu.socket}) และ Mainboard (${board.socket}) ไม่ตรงกัน` : "✅ อุปกรณ์เข้ากันได้ทั้งหมด (Compatible)"}</p>
      <div className="recommend-items">{result.products.length ? result.products.map(item => <div className="recommend-item" key={item.product_id}><span className="recommend-image-stage"><img src={normalizeImage(item.image || item.image_url)} alt={item.name} onError={useFallbackImage} /></span><span className="tag">{item.category}</span><b>{item.name}</b><span>฿{money(item.price)}</span></div>) : <p>ไม่สามารถจัดสเปกจากงบประมาณนี้ได้</p>}</div>
    </div>}</section>;
}

function ReportPage({ user, onLogin }) {
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  async function submitReport(event) {
    event.preventDefault();
    if (!user) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const category = String(form.get("category"));
    const subjects = { problem: "แจ้งปัญหา", suggestion: "ข้อเสนอแนะ", product: "แจ้งข้อมูลสินค้า" };
    setSending(true);
    setStatus("");
    try {
      const reportRef = push(ref(database, "reports"));
      await set(reportRef, {
        subject: subjects[category] || "รายงานจากผู้ใช้",
        category,
        message: String(form.get("message")).trim(),
        userId: user.uid,
        userEmail: user.email || "",
        status: "new",
        createdAt: databaseServerTimestamp()
      });
      formElement.reset();
      setStatus("ส่งรายงานเรียบร้อยแล้ว ผู้ดูแลระบบจะตรวจสอบให้ครับ");
    } catch (error) {
      console.error("ส่งรายงานไม่สำเร็จ:", error);
      setStatus("ส่งรายงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSending(false);
    }
  }
  return <section className="section report-page">
    <div className="section-head"><div><p className="eyebrow">PC ADVISOR</p><h2>แจ้งปัญหา / ส่งข้อเสนอแนะ</h2><p>แจ้งปัญหาการใช้งานหรือเสนอสิ่งที่อยากให้ปรับปรุง ข้อความจะส่งให้ผู้ดูแลระบบตรวจสอบ</p></div></div>
    {!user ? <div className="admin-message"><p>กรุณาเข้าสู่ระบบก่อนส่งรายงาน เพื่อให้ผู้ดูแลติดต่อกลับได้</p><button className="btn" onClick={onLogin}>เข้าสู่ระบบเพื่อแจ้งปัญหา</button></div> : <form className="report-form" onSubmit={submitReport}>
      <label>ประเภท<select name="category"><option value="problem">แจ้งปัญหา</option><option value="suggestion">เสนอแนะ</option><option value="product">ข้อมูลสินค้า</option></select></label>
      <label>รายละเอียด<textarea name="message" required minLength="5" maxLength="2000" rows="6" placeholder="อธิบายสิ่งที่พบให้ทีมงานเข้าใจได้ง่ายขึ้น" /></label>
      <button className="btn" disabled={sending}>{sending ? "กำลังส่ง..." : "ส่งรายงาน"}</button>
      {status && <p role="status" className="report-status">{status}</p>}
    </form>}
  </section>;
}

function AdminPage({ user, isAdmin, adminCheckReady, adminCheckError, adminValue, products }) {
  const [tab, setTab] = useState("products");
  const [reports, setReports] = useState([]);
  const [reportsReady, setReportsReady] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [editor, setEditor] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    return onValue(ref(database, "reports"), snapshot => {
      const entries = Object.entries(snapshot.val() || {}).map(([id, report]) => ({ id, ...report }));
      entries.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
      setReports(entries);
      setReportsReady(true);
    }, error => {
      console.error("โหลดรายงานไม่สำเร็จ:", error);
      setNotice("อ่านรายงานไม่ได้ กรุณาตรวจสอบกฎ Firebase Realtime Database");
    });
  }, [isAdmin]);

  useEffect(() => {
    if (selectedKey === "__new__") return;
    const selected = products.find(item => item.databaseKey === selectedKey);
    setEditor(selected ? { ...selected.sourceData } : {});
  }, [selectedKey, products]);

  if (!user) return <section className="section"><div className="admin-message"><h2>หน้าสำหรับผู้ดูแลระบบ</h2><p>กรุณาเข้าสู่ระบบด้วยบัญชีที่ได้รับสิทธิ์ผู้ดูแล</p></div></section>;
  if (!adminCheckReady) return <section className="section"><p>กำลังตรวจสอบสิทธิ์ผู้ดูแล...</p></section>;
  if (!isAdmin) return <section className="section"><div className="admin-message"><h2>{adminCheckError ? "เว็บอ่านข้อมูลสิทธิ์จาก Firebase ไม่ได้" : "ยังไม่พบสิทธิ์แอดมินของบัญชีนี้"}</h2><p>{adminCheckError ? `ข้อผิดพลาด: ${adminCheckError} — ตรวจสอบ Rules ของ Realtime Database ว่าอนุญาตให้อ่าน admins/{user.uid} ได้` : `บัญชีที่ล็อกอินมี UID: ${user.uid}`}</p>{!adminCheckError && <p>ค่าที่เว็บอ่านได้จาก admins/{user.uid}: <strong>{adminValue === null ? "ไม่พบข้อมูล" : JSON.stringify(adminValue)}</strong></p>}<p>เว็บตรวจจากฐานข้อมูล Firebase: {database.app.options.databaseURL}</p></div></section>;

  async function saveProduct(event) {
    event.preventDefault();
    setNotice("");
    let value;
    try {
      value = { ...editor, price: Number(editor.price || 0) };
      if (!value.name || !value.category) throw new Error("กรุณาระบุ name และ category");
    } catch (error) {
      setNotice(`ข้อมูลสินค้าไม่ถูกต้อง: ${error.message}`);
      return;
    }
    setSaving(true);
    try {
      if (selectedKey === "__new__") await set(push(ref(database, "products")), value);
      else await set(ref(database, `products/${selectedKey}`), value);
      setSelectedKey("");
      setEditor("");
      setNotice("บันทึกข้อมูลสินค้าแล้ว");
    } catch (error) {
      console.error("บันทึกสินค้าไม่สำเร็จ:", error);
      setNotice("บันทึกไม่สำเร็จ กรุณาตรวจสอบสิทธิ์และกฎ Firebase");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct() {
    if (!selectedKey || selectedKey === "__new__" || !window.confirm("ต้องการลบสินค้านี้ใช่หรือไม่?")) return;
    try {
      await remove(ref(database, `products/${selectedKey}`));
      setSelectedKey("");
      setEditor("");
      setNotice("ลบสินค้าแล้ว");
    } catch (error) {
      console.error("ลบสินค้าไม่สำเร็จ:", error);
      setNotice("ลบสินค้าไม่สำเร็จ กรุณาตรวจสอบสิทธิ์ Firebase");
    }
  }

  async function markReportReviewed(reportId) {
    try {
      await update(ref(database, `reports/${reportId}`), { status: "reviewed" });
      setNotice("รับทราบรายงานแล้ว");
    } catch (error) {
      console.error("อัปเดตสถานะรายงานไม่สำเร็จ:", error);
      setNotice("เปลี่ยนสถานะรายงานไม่สำเร็จ");
    }
  }

  async function deleteReport(report) {
    if (report.status !== "reviewed") return;
    if (!window.confirm(`ลบรายงาน “${report.subject || "ไม่มีหัวข้อ"}” ที่รับทราบแล้วใช่หรือไม่?`)) return;
    try {
      await remove(ref(database, `reports/${report.id}`));
      setNotice("ลบรายงานที่รับทราบแล้วเรียบร้อย");
    } catch (error) {
      console.error("ลบรายงานไม่สำเร็จ:", error);
      setNotice("ลบรายงานไม่สำเร็จ กรุณาตรวจสอบสิทธิ์ Firebase");
    }
  }

  return <section className="section admin-page">
    <div className="section-head"><div><p className="eyebrow">PC ADVISOR</p><h2>จัดการระบบ</h2><p>ลงชื่อเข้าใช้เป็น {user.email || "ผู้ดูแล"}</p></div></div>
    <div className="admin-tabs"><button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}>จัดการสินค้า ({products.length})</button><button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}>รายงานจากผู้ใช้ ({reports.filter(item => item.status !== "reviewed").length})</button></div>
    {notice && <p role="status" className="admin-notice">{notice}</p>}
    {tab === "products" ? <div className="admin-product-layout">
      <div className="admin-product-list"><button className="btn" onClick={() => { setSelectedKey("__new__"); setEditor({ product_id: "", name: "", category: "", brand: "", price: 0, image: "", socket: "", cores: "", threads: "", ram_type: "", power_consumption: "", description: "" }); setNotice(""); }}>เพิ่มสินค้าใหม่</button>
        {products.map(product => <button key={product.databaseKey} className={selectedKey === product.databaseKey ? "admin-product active" : "admin-product"} onClick={() => { setSelectedKey(product.databaseKey); setNotice(""); }}><b>{product.name}</b><span>{product.category} · ฿{money(product.price)}</span></button>)}
      </div>
      <form className="admin-editor" onSubmit={saveProduct}>
        <h3>{selectedKey === "__new__" ? "เพิ่มสินค้า" : "แก้ไขข้อมูลสินค้า"}</h3>
        {selectedKey ? <><p>กรอกหรือแก้ไขรายละเอียดสินค้าในช่องด้านล่าง ข้อมูลจะอัปเดตให้ผู้ใช้เห็นทันที</p><div className="product-edit-fields">{PRODUCT_FIELDS.map(([field, label]) => <label key={field}>{label}<input value={editor[field] ?? ""} type={field === "price" ? "number" : "text"} min={field === "price" ? "0" : undefined} onChange={event => setEditor(current => ({ ...current, [field]: event.target.value }))} /></label>)}<label className="product-description-field">รายละเอียด<textarea rows="4" value={editor.description ?? ""} onChange={event => setEditor(current => ({ ...current, description: event.target.value }))} /></label></div><div className="admin-actions"><button className="btn" disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึกสินค้า"}</button>{selectedKey !== "__new__" && <button type="button" className="secondary" onClick={deleteProduct}>ลบสินค้า</button>}</div></> : <p>เลือกสินค้าจากรายการ หรือกด “เพิ่มสินค้าใหม่”</p>}
      </form>
    </div> : <><p className="live-status" role="status">● {reportsReady ? "เชื่อมต่อแล้ว · รายงานอัปเดตอัตโนมัติแบบเรียลไทม์" : "กำลังเชื่อมต่อรายงาน..."}</p><div className="report-list">{reports.length ? reports.map(report => <article className="report-card" key={report.id}><div className="report-card-heading"><div><span className={report.status === "reviewed" ? "report-badge reviewed" : "report-badge"}>{report.status === "reviewed" ? "รับทราบแล้ว" : "รอตรวจสอบ"}</span><h3>{report.subject || "ไม่มีหัวข้อ"}</h3></div><span>{report.createdAt ? new Date(Number(report.createdAt)).toLocaleString("th-TH") : "เวลาส่งไม่พร้อมใช้งาน"}</span></div><p>{report.message}</p><small>ประเภท: {report.category || "ทั่วไป"} · ผู้ส่ง: {report.userEmail || report.userId}</small>{report.status !== "reviewed" ? <button className="secondary" onClick={() => markReportReviewed(report.id)}>รับทราบรายงาน</button> : <button className="secondary danger" onClick={() => deleteReport(report)}>ลบรายงาน</button>}</article>) : <div className="empty-state">ยังไม่มีรายงานจากผู้ใช้</div>}</div></>}
  </section>;
}
