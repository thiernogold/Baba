(() => {
  "use strict";

  /* ---------------- STORAGE ---------------- */
  const STORE_KEYS = { products: "gl_products", sales: "gl_sales", pin: "gl_pin" };

  const load = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  let products = load(STORE_KEYS.products, []);
  let sales = load(STORE_KEYS.sales, []);
  let pin = localStorage.getItem(STORE_KEYS.pin) || "1234";

  const persistProducts = () => save(STORE_KEYS.products, products);
  const persistSales = () => save(STORE_KEYS.sales, sales);
  const persistPin = () => localStorage.setItem(STORE_KEYS.pin, pin);

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const money = (n) => (Math.round(n * 100) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

  /* ---------------- NAVIGATION ---------------- */
  const views = document.querySelectorAll(".view");
  const navItems = document.querySelectorAll(".nav-item");
  const viewTitle = document.getElementById("viewTitle");
  const viewSubtitle = document.getElementById("viewSubtitle");

  const titles = {
    dashboard: ["Tableau de bord", "Vue d'ensemble de votre activité"],
    products: ["Produits", "Recherchez, vendez et gérez votre inventaire"],
    sales: ["Ventes", "Historique des ventes journalières et mensuelles"],
  };

  function switchView(name) {
    views.forEach(v => v.classList.toggle("active", v.id === "view-" + name));
    navItems.forEach(b => b.classList.toggle("active", b.dataset.view === name));
    viewTitle.textContent = titles[name][0];
    viewSubtitle.textContent = titles[name][1];
    if (name === "dashboard") renderDashboard();
    if (name === "products") renderProducts();
    if (name === "sales") renderSales();
  }
  navItems.forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));

  /* ---------------- CLOCK ---------------- */
  function tickClock() {
    const now = new Date();
    document.getElementById("clockDate").textContent =
      now.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    document.getElementById("clockTime").textContent =
      now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  tickClock();
  setInterval(tickClock, 1000);

  /* ---------------- TOASTS ---------------- */
  function toast(msg, isError = false) {
    const stack = document.getElementById("toastStack");
    const el = document.createElement("div");
    el.className = "toast" + (isError ? " error" : "");
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  /* ---------------- PIN GATE ---------------- */
  const pinModal = document.getElementById("pinModal");
  const pinInput = document.getElementById("pinInput");
  const pinError = document.getElementById("pinError");
  const pinModalTitle = document.getElementById("pinModalTitle");
  let pinSuccessCallback = null;

  function requirePin(callback, title = "Code confidentiel requis") {
    pinModalTitle.textContent = title;
    pinError.hidden = true;
    pinInput.value = "";
    pinSuccessCallback = callback;
    pinModal.hidden = false;
    setTimeout(() => pinInput.focus(), 50);
  }

  document.getElementById("pinCancel").addEventListener("click", () => pinModal.hidden = true);
  document.getElementById("pinConfirm").addEventListener("click", confirmPin);
  pinInput.addEventListener("keydown", e => { if (e.key === "Enter") confirmPin(); });

  function confirmPin() {
    if (pinInput.value === pin) {
      pinModal.hidden = true;
      const cb = pinSuccessCallback;
      pinSuccessCallback = null;
      if (cb) cb();
    } else {
      pinError.hidden = false;
      pinInput.value = "";
      pinInput.focus();
    }
  }

  /* ---------------- PRODUCTS: RENDER ---------------- */
  const productGrid = document.getElementById("productGrid");
  const productsEmpty = document.getElementById("productsEmpty");
  const searchInput = document.getElementById("searchInput");
  const LOW_STOCK_THRESHOLD = 5;

  function renderProducts() {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = products
      .filter(p => p.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));

    productGrid.innerHTML = "";
    productsEmpty.hidden = products.length !== 0;

    filtered.forEach(p => {
      const card = document.createElement("div");
      card.className = "product-card" + (p.quantity <= LOW_STOCK_THRESHOLD ? " low" : "");
      card.innerHTML = `
        <button class="edit-dot" data-edit="${p.id}" title="Modifier">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="product-name">${escapeHtml(p.name)}</div>
        <div class="product-meta">
          <div class="product-price">${money(p.salePrice)}</div>
          <div class="product-qty">disponible<br><strong>${p.quantity}</strong></div>
        </div>
        <button class="sell-btn" data-sell="${p.id}" ${p.quantity <= 0 ? "disabled" : ""}>
          ${p.quantity <= 0 ? "Rupture de stock" : "Vendre"}
        </button>
      `;
      productGrid.appendChild(card);
    });

    productGrid.querySelectorAll("[data-sell]").forEach(btn =>
      btn.addEventListener("click", () => openSellModal(btn.dataset.sell)));
    productGrid.querySelectorAll("[data-edit]").forEach(btn =>
      btn.addEventListener("click", () => requirePin(() => openProductModal(btn.dataset.edit), "Code requis pour modifier")));
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  searchInput.addEventListener("input", renderProducts);

  /* ---------------- PRODUCTS: ADD / EDIT MODAL ---------------- */
  const productModal = document.getElementById("productModal");
  const productForm = document.getElementById("productForm");
  const productModalTitle = document.getElementById("productModalTitle");
  const deleteProductBtn = document.getElementById("deleteProductBtn");
  let editingProductId = null;

  document.getElementById("openAddProduct").addEventListener("click", () =>
    requirePin(() => openProductModal(null), "Code requis pour ajouter un produit"));

  function openProductModal(productId) {
    editingProductId = productId;
    const p = productId ? products.find(x => x.id === productId) : null;
    productModalTitle.textContent = p ? "Modifier le produit" : "Ajouter un produit";
    document.getElementById("pName").value = p ? p.name : "";
    document.getElementById("pBuy").value = p ? p.purchasePrice : "";
    document.getElementById("pSell").value = p ? p.salePrice : "";
    document.getElementById("pQty").value = p ? p.quantity : "";
    deleteProductBtn.hidden = !p;
    productModal.hidden = false;
    setTimeout(() => document.getElementById("pName").focus(), 50);
  }

  document.getElementById("productCancel").addEventListener("click", () => productModal.hidden = true);

  productForm.addEventListener("submit", e => {
    e.preventDefault();
    const name = document.getElementById("pName").value.trim();
    const purchasePrice = parseFloat(document.getElementById("pBuy").value);
    const salePrice = parseFloat(document.getElementById("pSell").value);
    const quantity = parseInt(document.getElementById("pQty").value, 10);

    if (!name || isNaN(purchasePrice) || isNaN(salePrice) || isNaN(quantity)) {
      toast("Veuillez remplir tous les champs correctement.", true);
      return;
    }

    if (editingProductId) {
      const p = products.find(x => x.id === editingProductId);
      Object.assign(p, { name, purchasePrice, salePrice, quantity });
      toast(`« ${name} » mis à jour.`);
    } else {
      products.push({ id: uid(), name, purchasePrice, salePrice, quantity });
      toast(`« ${name} » ajouté au stock.`);
    }
    persistProducts();
    productModal.hidden = true;
    renderProducts();
    renderDashboard();
  });

  deleteProductBtn.addEventListener("click", () => {
    if (!editingProductId) return;
    const p = products.find(x => x.id === editingProductId);
    products = products.filter(x => x.id !== editingProductId);
    persistProducts();
    productModal.hidden = true;
    toast(`« ${p.name} » supprimé du stock.`);
    renderProducts();
    renderDashboard();
  });

  /* ---------------- SELL MODAL ---------------- */
  const sellModal = document.getElementById("sellModal");
  const sellQtyInput = document.getElementById("sellQty");
  const sellError = document.getElementById("sellError");
  let sellingProductId = null;

  function openSellModal(productId) {
    const p = products.find(x => x.id === productId);
    if (!p || p.quantity <= 0) return;
    sellingProductId = productId;
    document.getElementById("sellProductName").textContent = p.name;
    document.getElementById("sellAvailable").textContent = p.quantity;
    document.getElementById("sellPrice").textContent = money(p.salePrice);
    sellQtyInput.value = 1;
    sellQtyInput.max = p.quantity;
    sellError.hidden = true;
    sellModal.hidden = false;
    setTimeout(() => sellQtyInput.focus(), 50);
  }

  document.getElementById("sellCancel").addEventListener("click", () => sellModal.hidden = true);
  document.getElementById("sellConfirm").addEventListener("click", confirmSell);
  sellQtyInput.addEventListener("keydown", e => { if (e.key === "Enter") confirmSell(); });

  function confirmSell() {
    const p = products.find(x => x.id === sellingProductId);
    const qty = parseInt(sellQtyInput.value, 10);
    if (!p || isNaN(qty) || qty < 1 || qty > p.quantity) {
      sellError.hidden = false;
      return;
    }
    p.quantity -= qty;
    persistProducts();

    const now = new Date();
    sales.push({
      id: uid(),
      productId: p.id,
      productName: p.name,
      unitPrice: p.salePrice,
      unitCost: p.purchasePrice,
      quantity: qty,
      total: p.salePrice * qty,
      profit: (p.salePrice - p.purchasePrice) * qty,
      iso: now.toISOString(),
      dayKey: dayKey(now),
      monthKey: monthKey(now),
      dateLabel: now.toLocaleDateString("fr-FR"),
      timeLabel: now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    });
    persistSales();

    sellModal.hidden = true;
    toast(`Vente enregistrée : ${qty} × ${p.name} — ${money(p.salePrice * qty)}`);
    renderProducts();
    renderDashboard();
    populateMonthSelect();
    renderSales();
  }

  /* ---------------- DATE HELPERS ---------------- */
  function dayKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function monthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const MONTH_NAMES = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  function monthLabel(key) {
    const [y, m] = key.split("-");
    return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
  }

  /* ---------------- DASHBOARD ---------------- */
  function renderDashboard() {
    document.getElementById("statProductCount").textContent = products.length;
    const stockValue = products.reduce((sum, p) => sum + p.purchasePrice * p.quantity, 0);
    document.getElementById("statStockValue").textContent = money(stockValue);

    const now = new Date();
    const todayKey = dayKey(now);
    const thisMonthKey = monthKey(now);

    const todayTotal = sales.filter(s => s.dayKey === todayKey).reduce((s, x) => s + x.total, 0);
    const monthTotal = sales.filter(s => s.monthKey === thisMonthKey).reduce((s, x) => s + x.total, 0);
    document.getElementById("statTodaySales").textContent = money(todayTotal);
    document.getElementById("statMonthSales").textContent = money(monthTotal);

    const lowStockList = document.getElementById("lowStockList");
    const low = products.filter(p => p.quantity <= LOW_STOCK_THRESHOLD).sort((a, b) => a.quantity - b.quantity);
    if (low.length === 0) {
      lowStockList.innerHTML = `<p class="empty-note">Aucun produit en stock faible pour le moment.</p>`;
    } else {
      lowStockList.innerHTML = low.map(p => `
        <div class="low-stock-row">
          <span>${escapeHtml(p.name)}</span>
          <span class="qty-badge">${p.quantity} restant(s)</span>
        </div>`).join("");
    }
  }

  /* ---------------- SALES VIEW ---------------- */
  const monthSelect = document.getElementById("monthSelect");

  function populateMonthSelect() {
    const keys = Array.from(new Set(sales.map(s => s.monthKey))).sort().reverse();
    const currentKey = monthKey(new Date());
    if (!keys.includes(currentKey)) keys.unshift(currentKey);

    const prevValue = monthSelect.value;
    monthSelect.innerHTML = keys.map(k => `<option value="${k}">${monthLabel(k)}</option>`).join("");
    monthSelect.value = keys.includes(prevValue) ? prevValue : currentKey;
  }

  monthSelect.addEventListener("change", renderSales);

  function renderSales() {
    const selectedMonth = monthSelect.value || monthKey(new Date());
    const monthSales = sales.filter(s => s.monthKey === selectedMonth);

    const total = monthSales.reduce((s, x) => s + x.total, 0);
    const profit = monthSales.reduce((s, x) => s + x.profit, 0);
    const units = monthSales.reduce((s, x) => s + x.quantity, 0);
    document.getElementById("monthTotal").textContent = money(total);
    document.getElementById("monthProfit").textContent = money(profit);
    document.getElementById("monthUnits").textContent = units;

    const byDay = {};
    monthSales.forEach(s => {
      if (!byDay[s.dayKey]) byDay[s.dayKey] = { count: 0, units: 0, total: 0, profit: 0 };
      byDay[s.dayKey].count += 1;
      byDay[s.dayKey].units += s.quantity;
      byDay[s.dayKey].total += s.total;
      byDay[s.dayKey].profit += s.profit;
    });

    const todayKey = dayKey(new Date());
    const days = Object.keys(byDay).sort().reverse();
    const tbody = document.getElementById("dailySalesBody");
    const salesEmpty = document.getElementById("salesEmpty");

    if (days.length === 0) {
      tbody.innerHTML = "";
      salesEmpty.hidden = false;
    } else {
      salesEmpty.hidden = true;
      tbody.innerHTML = days.map(d => {
        const row = byDay[d];
        const label = new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
        return `<tr class="${d === todayKey ? "today-row" : ""}">
          <td>${label}</td>
          <td>${row.count}</td>
          <td>${row.units}</td>
          <td>${money(row.total)}</td>
          <td>${money(row.profit)}</td>
        </tr>`;
      }).join("");
    }
  }

  /* ---------------- SETTINGS (CHANGE PIN) ---------------- */
  const settingsModal = document.getElementById("settingsModal");
  const settingsError = document.getElementById("settingsError");

  document.getElementById("openSettings").addEventListener("click", () =>
    requirePin(() => {
      document.getElementById("newPin").value = "";
      document.getElementById("newPinConfirm").value = "";
      settingsError.hidden = true;
      settingsModal.hidden = false;
    }, "Code actuel requis"));

  document.getElementById("settingsCancel").addEventListener("click", () => settingsModal.hidden = true);
  document.getElementById("settingsConfirm").addEventListener("click", () => {
    const a = document.getElementById("newPin").value.trim();
    const b = document.getElementById("newPinConfirm").value.trim();
    if (!/^\d{4,12}$/.test(a)) {
      settingsError.textContent = "Le code doit contenir entre 4 et 12 chiffres.";
      settingsError.hidden = false;
      return;
    }
    if (a !== b) {
      settingsError.textContent = "Les deux codes ne correspondent pas.";
      settingsError.hidden = false;
      return;
    }
    pin = a;
    persistPin();
    settingsModal.hidden = true;
    toast("Code confidentiel mis à jour.");
  });

  /* ---------------- CLOSE MODALS ON BACKDROP CLICK ---------------- */
  [pinModal, productModal, sellModal, settingsModal].forEach(modal => {
    modal.addEventListener("click", e => { if (e.target === modal) modal.hidden = true; });
  });

  /* ---------------- INIT ---------------- */
  populateMonthSelect();
  renderDashboard();
  renderProducts();
  renderSales();
})();
