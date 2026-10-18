import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { onValue, ref } from "firebase/database";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, database, firestore } from "./firebase.js";

const pages = [
  ["/", "หน้าแรก"],
  ["/products.html", "สินค้า"],
  ["/builder.html", "จัดสเปก"],
  ["/favorites.html", "รายการโปรด"],
  ["/about.html", "เกี่ยวกับ"]
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
    product_id: item.product_id || id,
    category: item.category || item.category_id || "",
    brand: item.brand || item.brand_id || "",
    image: item.image || item.image_url || "https://placehold.co/150x150?text=No+Image"
  }));
}

export default function App() {
  const pathname = window.location.pathname;
  const page = pages.some(([path]) => path === pathname) ? pathname : "/";
  const [products, setProducts] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [user, setUser] = useState(null);
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

  useEffect(() => onAuthStateChanged(auth, setUser), []);

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
    <Header page={page} user={user} onAuth={() => user ? signOut(auth) : setAuthDialog(true)} />
    <main>
      {page === "/" && <HomePage products={products} categories={categories} loading={catalogLoading} />}
      {page === "/products.html" && <ProductsPage products={products} categories={categories} brands={brands} favorites={favorites} compareList={compareList} loading={catalogLoading} error={catalogError} onFavorite={toggleFavorite} onCompare={toggleCompare} onSelect={setSelectedProduct} />}
      {page === "/builder.html" && <BuilderPage />}
      {page === "/favorites.html" && <FavoritesPage products={products} favorites={favorites} loading={catalogLoading} error={catalogError} onFavorite={toggleFavorite} onCompare={toggleCompare} compareList={compareList} onSelect={setSelectedProduct} />}
      {page === "/about.html" && <AboutPage />}
    </main>
    <Footer />
    {selectedProduct && <ProductDialog product={selectedProduct} products={products} onClose={() => setSelectedProduct(null)} onSelect={setSelectedProduct} />}
    {compareList.length > 0 && <CompareTray products={products} compareList={compareList} onView={() => setCompareDialog(true)} onClear={() => setCompareList([])} />}
    {compareDialog && <CompareDialog products={products.filter(item => compareList.includes(item.product_id))} onClose={() => setCompareDialog(false)} />}
    {authDialog && <AuthDialog mode={authMode} error={authError} onMode={() => { setAuthMode(value => value === "signin" ? "signup" : "signin"); setAuthError(""); }} onClose={() => setAuthDialog(false)} onSubmit={submitAuth} />}
  </>;
}

function Header({ page, user, onAuth }) {
  return <header><div className="nav">
    <a className="logo" href="/" aria-label="PC Advisor หน้าแรก"><img src="/logo01.png" alt="" /><span>PC Advisor<small>HARDWARE GUIDE</small></span></a>
    <nav aria-label="เมนูหลัก">{pages.map(([path, label]) => <a key={path} href={path} className={page === path ? "active" : ""}>{label}</a>)}</nav>
    <div className="member-area"><span>{user ? `👤 ${user.email || "สมาชิก"}` : "Guest"}</span><button className="auth-button" onClick={onAuth}>{user ? "ออกจากระบบ" : "เข้าสู่ระบบ"}</button></div>
  </div></header>;
}

function Footer() { return <footer>PC Advisor • React + Firebase Realtime Database</footer>; }

function HomePage({ products, categories, loading }) {
  const counts = categories.map(category => [category, products.filter(item => item.category === category).length]);
  return <>
    <section className="hero"><div className="hero-inner">
      <div className="hero-copy">
        <span className="pill"><i /> PC HARDWARE FINDER</span>
        <h1>ประกอบคอม<br />ให้เป็นเรื่อง<span>ง่าย</span></h1>
        <p>ค้นหา เปรียบเทียบ และจัดสเปกคอมพิวเตอร์<br className="desktop-break" /> ให้พอดีกับงบและการใช้งานของคุณ</p>
        <div className="hero-actions"><a className="btn" href="/products.html">เลือกดูอุปกรณ์ <span>↗</span></a><a className="hero-secondary" href="/builder.html">ให้เราช่วยจัดสเปก <span>→</span></a></div>
        <div className="hero-note"><span>✳</span> ข้อมูลสินค้าอัปเดตจากฐานข้อมูลโดยตรง</div>
      </div>
      <div className="hero-card">
        <div className="hero-card-top"><span>PC ADVISOR / CATALOG</span><span className="live-dot">LIVE</span></div>
        <div className="hero-card-number">{loading ? "—" : String(products.length).padStart(2, "0")}<small> รายการ</small></div>
        <p>อุปกรณ์พร้อมให้คุณเลือก</p>
        <div className="category-preview">{counts.slice(0, 6).map(([category, count], index) => <span className="category-row" key={category}><i className={`category-symbol symbol-${index}`}>{["◈", "▧", "◉", "▦", "⌁", "▤"][index]}</i><b>{category}</b><small>{String(count).padStart(2, "0")}</small></span>)}</div>
        <a href="/products.html" className="catalog-link">สำรวจแคตตาล็อกทั้งหมด <span>↗</span></a>
        <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
      </div>
    </div></section>
    <section className="home-intro"><span>01 / เริ่มต้นได้ง่าย</span><p>ไม่ว่าคุณจะกำลังประกอบคอมเครื่องแรก หรืออัปเกรดเครื่องเดิม<br />เครื่องมือที่จำเป็นอยู่ตรงนี้แล้ว</p></section>
  </>;
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
  return <article className="card product-card" onClick={() => onSelect(product)}>
    <div className="card-actions"><button className={favorite ? "icon-button selected-favorite" : "icon-button"} aria-label="เพิ่มหรือลบรายการโปรด" onClick={e => { e.stopPropagation(); onFavorite(product.product_id); }}>❤️</button><button className={compared ? "icon-button selected-compare" : "icon-button"} aria-label="เปรียบเทียบ" onClick={e => { e.stopPropagation(); onCompare(product.product_id); }}>⚖️</button></div>
    <img className="product-image" src={product.image} alt={product.name} onError={e => { e.currentTarget.src = "https://placehold.co/150x150?text=No+Image"; }} />
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
    <img className="dialog-image" src={product.image} alt={product.name} onError={e => { e.currentTarget.src = "https://placehold.co/120x120?text=No+Image"; }} /><span className="tag">{product.category}</span><h2>{product.name}</h2><div className="price">฿{money(product.price)}</div>
    <table className="detail-table"><tbody>{fields.map(([key, value]) => <tr key={key}><td>{key}</td><td>{value || "-"}</td></tr>)}</tbody></table>
    <h3>อุปกรณ์ที่เกี่ยวข้อง ({product.category})</h3><div className="related-grid">{related.map(item => <button className="related-item" key={item.product_id} onClick={() => onSelect(item)}><img src={item.image} alt="" /><b>{item.name}</b><span>฿{money(item.price)}</span></button>)}</div>
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
      <div className="recommend-items">{result.products.length ? result.products.map(item => <div className="recommend-item" key={item.product_id}><img src={item.image} alt={item.name} onError={e => { e.currentTarget.src = "https://placehold.co/60x60?text=No+Image"; }} /><span className="tag">{item.category}</span><b>{item.name}</b><span>฿{money(item.price)}</span></div>) : <p>ไม่สามารถจัดสเปกจากงบประมาณนี้ได้</p>}</div>
    </div>}</section>;
}

function AboutPage() {
  return <section className="about section"><p className="eyebrow">ABOUT PC ADVISOR</p><h2>เกี่ยวกับระบบ</h2><p>เว็บแอปช่วยค้นหา เปรียบเทียบ และวางแผนสเปกคอมพิวเตอร์</p><div className="technology-list"><span>React + Vite</span><span>Node.js + Express API</span><span>Firebase Realtime Database</span><span>Firebase Authentication</span><span>Cloud Firestore</span></div><div className="api-list"><code>GET /api/recommend</code><code>POST /api/recommend</code></div></section>;
}
