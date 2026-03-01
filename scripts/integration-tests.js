const assert = require("node:assert/strict");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseCookie(setCookieValue) {
  if (!setCookieValue) {
    return "";
  }
  return setCookieValue.split(";")[0];
}

async function waitForServer(baseUrl, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetchWithTimeout(`${baseUrl}/login`, {}, 3000);
      if (res.ok) {
        return;
      }
    } catch {
      // keep waiting
    }
    await sleep(500);
  }
  throw new Error("Timeout: serveur Next introuvable");
}

async function stopProcessTree(pid) {
  if (!pid) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("cmd.exe", ["/c", "taskkill", "/PID", String(pid), "/T", "/F"], {
        stdio: "ignore"
      });
      killer.once("exit", () => resolve());
      killer.once("error", () => resolve());
    });
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
}

async function run() {
  const cwd = process.cwd();
  const buildIdPath = path.join(cwd, ".next", "BUILD_ID");

  try {
    require("node:fs").accessSync(buildIdPath);
  } catch {
    throw new Error("Build manquant. Lancez d'abord: npm run build");
  }

  const port = Number(process.env.INTEGRATION_PORT || 4010 + Math.floor(Math.random() * 400));
  const baseUrl = `http://127.0.0.1:${port}`;

  const env = {
    ...process.env,
    ALL_PROXY: "",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    GIT_HTTP_PROXY: "",
    GIT_HTTPS_PROXY: ""
  };

  const server = spawn("cmd.exe", ["/c", "npm.cmd", "run", "start", "--", "-p", String(port)], {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let serverLogs = "";
  server.stdout.on("data", (chunk) => {
    serverLogs += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverLogs += chunk.toString();
  });

  let cookie = "";

  async function api(pathname, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    if (cookie) {
      headers.Cookie = cookie;
    }

    const res = await fetchWithTimeout(`${baseUrl}${pathname}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const setCookie = res.headers.get("set-cookie");
    if (setCookie && setCookie.includes("optica_session=")) {
      cookie = parseCookie(setCookie);
    }

    const payload = await res.json().catch(() => null);
    return { res, payload };
  }

  async function apiRaw(pathname, options = {}) {
    const headers = {
      ...(options.headers || {})
    };

    if (cookie) {
      headers.Cookie = cookie;
    }

    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetchWithTimeout(`${baseUrl}${pathname}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const setCookie = res.headers.get("set-cookie");
    if (setCookie && setCookie.includes("optica_session=")) {
      cookie = parseCookie(setCookie);
    }

    const text = await res.text();
    return { res, text };
  }

  async function page(pathname) {
    const headers = cookie ? { Cookie: cookie } : {};
    const res = await fetchWithTimeout(`${baseUrl}${pathname}`, {
      method: "GET",
      headers
    });
    const text = await res.text();
    return { res, text };
  }

  async function loginAs(username, password, messagePrefix = "login") {
    cookie = "";
    const login = await api("/api/auth/login", {
      method: "POST",
      body: { username, password }
    });
    assert.equal(login.res.status, 200, `${messagePrefix} ${username} doit reussir`);
    return login.payload?.data;
  }

  try {
    await waitForServer(baseUrl);

    const suffix = Date.now().toString().slice(-6);
    const testPassword = "test1234";
    const sellerUsername = `vendeur_${suffix}`;
    const stockUsername = `stock_${suffix}`;
    const opticianUsername = `opticien_${suffix}`;

    await loginAs("admin", "admin1234", "login admin");

    const me = await api("/api/auth/me");
    assert.equal(me.res.status, 200, "session /me doit etre valide");

    const orderSequence = await prisma.sequence.findUnique({ where: { type: "ORDER" } });
    assert.ok(orderSequence, "sequence ORDER manquante");
    const initialOrderSequence = orderSequence.currentValue;
    const raisedOrderSequence = initialOrderSequence + 2;

    const sequenceRaise = await api(`/api/admin/sequences/${orderSequence.id}`, {
      method: "PATCH",
      body: { currentValue: raisedOrderSequence }
    });
    assert.equal(sequenceRaise.res.status, 200, "admin doit pouvoir augmenter sequence");

    const sequenceDecreaseBlocked = await api(`/api/admin/sequences/${orderSequence.id}`, {
      method: "PATCH",
      body: { currentValue: initialOrderSequence }
    });
    assert.equal(sequenceDecreaseBlocked.res.status, 409, "baisse sequence sans force doit etre refusee");

    const sequenceDecreaseForced = await api(`/api/admin/sequences/${orderSequence.id}`, {
      method: "PATCH",
      body: { currentValue: initialOrderSequence, force: true }
    });
    assert.equal(sequenceDecreaseForced.res.status, 200, "baisse sequence avec force doit etre autorisee");

    const backupCreate = await api("/api/admin/backup", { method: "POST" });
    assert.equal(backupCreate.res.status, 201, "creation backup admin echouee");
    const backupRecordId = backupCreate.payload.data.recordId;
    assert.ok(backupRecordId, "recordId backup manquant");

    const backupValidate = await api("/api/admin/restore", {
      method: "POST",
      body: { backupId: backupRecordId, dryRun: true }
    });
    assert.equal(backupValidate.res.status, 200, "validation backup dry-run echouee");
    assert.equal(backupValidate.payload.data.valid, true, "validation backup doit etre true");

    const backupRestoreNoConfirm = await api("/api/admin/restore", {
      method: "POST",
      body: { backupId: backupRecordId }
    });
    assert.equal(backupRestoreNoConfirm.res.status, 400, "restore sans confirmation doit etre refuse");

    const backupValidateOutside = await api("/api/admin/restore", {
      method: "POST",
      body: { filePath: "C:\\\\Windows\\\\System32\\\\drivers\\\\etc\\\\hosts", dryRun: true }
    });
    assert.equal(backupValidateOutside.res.status, 409, "validation backup hors dossier doit etre refusee");

    const category = await prisma.productCategory.findFirst({ orderBy: { name: "asc" } });
    assert.ok(category, "categorie seed manquante");

    const supplierCreate = await api("/api/suppliers", {
      method: "POST",
      body: {
        name: `Fournisseur Test ${suffix}`,
        phone: "0555000000",
        paymentTermsDays: 30,
        openingBalance: 0
      }
    });
    assert.equal(supplierCreate.res.status, 201, "creation fournisseur echouee");
    const supplierId = supplierCreate.payload.data.id;

    const productCreate = await api("/api/products", {
      method: "POST",
      body: {
        sku: `SKU-TST-${suffix}`,
        name: `Produit Test ${suffix}`,
        categoryId: category.id,
        supplierId,
        unit: "piece",
        buyPrice: 10,
        sellPrice: 30,
        reorderLevel: 1
      }
    });
    assert.equal(productCreate.res.status, 201, "creation produit echouee");
    const productId = productCreate.payload.data.id;

    const stockIn1 = await api("/api/stock/movements", {
      method: "POST",
      body: {
        productId,
        type: "IN",
        qty: 5,
        unitCost: 10,
        note: "lot1"
      }
    });
    assert.equal(stockIn1.res.status, 201, "stock in lot1 echoue");

    const stockIn2 = await api("/api/stock/movements", {
      method: "POST",
      body: {
        productId,
        type: "IN",
        qty: 5,
        unitCost: 20,
        note: "lot2"
      }
    });
    assert.equal(stockIn2.res.status, 201, "stock in lot2 echoue");

    const sellerUser = await api("/api/admin/users", {
      method: "POST",
      body: {
        username: sellerUsername,
        displayName: `Vendeur ${suffix}`,
        password: testPassword,
        role: "VENDEUR"
      }
    });
    assert.equal(sellerUser.res.status, 201, "creation utilisateur vendeur echouee");

    const stockUser = await api("/api/admin/users", {
      method: "POST",
      body: {
        username: stockUsername,
        displayName: `Stock ${suffix}`,
        password: testPassword,
        role: "GESTIONNAIRE_STOCK"
      }
    });
    assert.equal(stockUser.res.status, 201, "creation utilisateur stock echouee");

    const opticianUser = await api("/api/admin/users", {
      method: "POST",
      body: {
        username: opticianUsername,
        displayName: `Opticien ${suffix}`,
        password: testPassword,
        role: "OPTICIEN"
      }
    });
    assert.equal(opticianUser.res.status, 201, "creation utilisateur opticien echouee");

    await loginAs(sellerUsername, testPassword, "login vendeur");

    const sellerSequenceWrite = await api(`/api/admin/sequences/${orderSequence.id}`, {
      method: "PATCH",
      body: { currentValue: initialOrderSequence + 1 }
    });
    assert.equal(sellerSequenceWrite.res.status, 403, "vendeur ne doit pas gerer les sequences");

    const sellerProducts = await api("/api/products");
    assert.equal(sellerProducts.res.status, 200, "vendeur doit lire produits");
    assert.ok(Array.isArray(sellerProducts.payload.data), "liste produits vendeur invalide");
    const sellerProduct = sellerProducts.payload.data.find((item) => item.id === productId);
    assert.ok(sellerProduct, "produit test introuvable pour vendeur");
    assert.equal("buyPrice" in sellerProduct, false, "vendeur ne doit pas voir buyPrice");

    const sellerProductDetails = await api(`/api/products/${productId}`);
    assert.equal(sellerProductDetails.res.status, 200, "vendeur doit lire detail produit");
    assert.equal("buyPrice" in sellerProductDetails.payload.data, false, "vendeur ne doit pas voir buyPrice en detail");

    const sellerStockLedger = await api("/api/stock/ledger");
    assert.equal(sellerStockLedger.res.status, 200, "vendeur doit lire ledger stock");
    assert.ok(Array.isArray(sellerStockLedger.payload.data), "ledger vendeur invalide");
    if (sellerStockLedger.payload.data.length > 0) {
      assert.equal("unitCost" in sellerStockLedger.payload.data[0], false, "vendeur ne doit pas voir unitCost dans ledger");
      if (sellerStockLedger.payload.data[0].product) {
        assert.equal(
          "buyPrice" in sellerStockLedger.payload.data[0].product,
          false,
          "vendeur ne doit pas voir buyPrice produit via ledger"
        );
      }
    }

    const sellerSuppliers = await api("/api/suppliers");
    assert.equal(sellerSuppliers.res.status, 403, "vendeur ne doit pas acceder fournisseurs");

    const sellerSuppliersPage = await page("/suppliers");
    assert.equal(sellerSuppliersPage.res.status, 200, "page fournisseurs vendeur doit repondre");
    assert.ok(
      sellerSuppliersPage.text.includes("Acces refuse pour ce role"),
      "page fournisseurs vendeur doit afficher acces refuse"
    );

    const sellerPO = await api("/api/purchase-orders");
    assert.equal(sellerPO.res.status, 403, "vendeur ne doit pas acceder achats");

    const sellerInvoices = await api("/api/supplier-invoices");
    assert.equal(sellerInvoices.res.status, 403, "vendeur ne doit pas acceder finance fournisseur");

    const sellerAging = await api("/api/reports/supplier-aging");
    assert.equal(sellerAging.res.status, 403, "vendeur ne doit pas acceder aging fournisseur");

    const sellerAgingPage = await page("/reports/supplier-aging");
    assert.equal(sellerAgingPage.res.status, 200, "page aging vendeur doit repondre");
    assert.ok(sellerAgingPage.text.includes("Acces refuse pour ce role"), "page aging vendeur doit afficher acces refuse");

    const sellerAccountingPage = await page("/reports/accounting");
    assert.equal(sellerAccountingPage.res.status, 200, "page comptabilite vendeur doit repondre");
    assert.ok(
      sellerAccountingPage.text.includes("Acces reserve a l'administrateur"),
      "page comptabilite vendeur doit afficher acces reserve"
    );

    const sellerAccountingSummary = await api("/api/reports/accounting/summary");
    assert.equal(sellerAccountingSummary.res.status, 403, "vendeur ne doit pas acceder au module comptable admin");

    const sellerBackupRead = await api("/api/admin/backups");
    assert.equal(sellerBackupRead.res.status, 403, "vendeur ne doit pas lire backups");

    const sellerBackupCreate = await api("/api/admin/backup", { method: "POST" });
    assert.equal(sellerBackupCreate.res.status, 403, "vendeur ne doit pas creer backup admin");

    const sellerProductCreate = await api("/api/products", {
      method: "POST",
      body: {
        sku: `SKU-SELLER-${suffix}`,
        name: `Produit Interdit ${suffix}`,
        categoryId: category.id,
        supplierId,
        unit: "piece",
        buyPrice: 12,
        sellPrice: 20,
        reorderLevel: 1
      }
    });
    assert.equal(sellerProductCreate.res.status, 403, "vendeur ne doit pas creer produit");

    const sellerCloseWithoutOpen = await api("/api/reports/daily-cash/shift/close", {
      method: "POST",
      body: { closingCashDeclared: 0 }
    });
    assert.equal(sellerCloseWithoutOpen.res.status, 409, "cloture sans ouverture doit etre refusee");

    const sellerOpenShift = await api("/api/reports/daily-cash/shift/open", {
      method: "POST",
      body: { openingCash: 100 }
    });
    assert.equal(sellerOpenShift.res.status, 201, "ouverture caisse vendeur echouee");

    const sellerOpenShiftAgain = await api("/api/reports/daily-cash/shift/open", {
      method: "POST",
      body: { openingCash: 20 }
    });
    assert.equal(sellerOpenShiftAgain.res.status, 409, "double ouverture caisse doit etre refusee");

    const sellerPatient = await api("/api/patients", {
      method: "POST",
      body: {
        firstName: "Seller",
        lastName: `Cash-${suffix}`,
        phone: "0777000000"
      }
    });
    assert.equal(sellerPatient.res.status, 201, "creation patient vendeur echouee");
    const sellerPatientId = sellerPatient.payload.data.id;

    const sellerOrder = await api("/api/orders", {
      method: "POST",
      body: {
        patientId: sellerPatientId,
        orderDate: new Date().toISOString(),
        items: [{ descriptionSnapshot: `Service vendeur ${suffix}`, qty: 1, unitPrice: 50 }]
      }
    });
    assert.equal(sellerOrder.res.status, 201, "creation commande vendeur echouee");
    const sellerOrderId = sellerOrder.payload.data.id;

    const sellerCashPayment = await api(`/api/orders/${sellerOrderId}/payments`, {
      method: "POST",
      body: { amount: 50, method: "CASH", paidAt: new Date().toISOString() }
    });
    assert.equal(sellerCashPayment.res.status, 201, "paiement cash vendeur echoue");
    const sellerCancelPayment = await api(
      `/api/orders/${sellerOrderId}/payments/${sellerCashPayment.payload.data.payment.id}/cancel`,
      {
        method: "POST",
        body: { reason: "Test annulation paiement vendeur" }
      }
    );
    assert.equal(sellerCancelPayment.res.status, 403, "vendeur ne doit pas annuler un paiement client");

    const sellerCloseShift = await api("/api/reports/daily-cash/shift/close", {
      method: "POST",
      body: { closingCashDeclared: 150 }
    });
    assert.equal(sellerCloseShift.res.status, 200, "cloture caisse vendeur echouee");
    assert.equal(
      Number(sellerCloseShift.payload.data.summary.expectedCash.toFixed(2)),
      150,
      "expected cash shift vendeur incorrect"
    );
    assert.equal(
      Number(sellerCloseShift.payload.data.summary.variance.toFixed(2)),
      0,
      "ecart caisse vendeur incorrect"
    );

    const sellerCloseShiftAgain = await api("/api/reports/daily-cash/shift/close", {
      method: "POST",
      body: { closingCashDeclared: 150 }
    });
    assert.equal(sellerCloseShiftAgain.res.status, 409, "double cloture caisse doit etre refusee");

    await loginAs(stockUsername, testPassword, "login gestionnaire stock");

    const stockUsers = await api("/api/admin/users");
    assert.equal(stockUsers.res.status, 403, "gestionnaire stock ne doit pas acceder users");

    const stockUsersPage = await page("/settings/users");
    assert.equal(stockUsersPage.res.status, 200, "page users gestionnaire stock doit repondre");
    assert.ok(
      stockUsersPage.text.includes("Acces reserve a l'administrateur"),
      "page users gestionnaire stock doit afficher acces reserve"
    );

    const stockOrderWrite = await api("/api/orders", {
      method: "POST",
      body: {
        patientId: "dummy",
        orderDate: new Date().toISOString(),
        items: [{ descriptionSnapshot: "x", qty: 1, unitPrice: 1 }]
      }
    });
    assert.equal(stockOrderWrite.res.status, 403, "gestionnaire stock ne doit pas creer commande");

    const stockOpenShift = await api("/api/reports/daily-cash/shift/open", {
      method: "POST",
      body: { openingCash: 10 }
    });
    assert.equal(stockOpenShift.res.status, 403, "gestionnaire stock ne doit pas ouvrir caisse vendeur");

    const stockBackupRead = await api("/api/admin/backups");
    assert.equal(stockBackupRead.res.status, 403, "gestionnaire stock ne doit pas lire backups admin");
    const stockCancelSupplierPayment = await api("/api/supplier-invoices/dummy/payments/dummy/cancel", {
      method: "POST",
      body: { reason: "Test annulation paiement fournisseur non admin" }
    });
    assert.equal(stockCancelSupplierPayment.res.status, 403, "gestionnaire stock ne doit pas annuler paiement fournisseur");

    await loginAs(opticianUsername, testPassword, "login opticien");

    const opticianStockWrite = await api("/api/stock/movements", {
      method: "POST",
      body: {
        productId,
        type: "IN",
        qty: 1,
        unitCost: 10
      }
    });
    assert.equal(opticianStockWrite.res.status, 403, "opticien ne doit pas ecrire stock");

    const opticianPurchasing = await api("/api/purchase-orders");
    assert.equal(opticianPurchasing.res.status, 403, "opticien ne doit pas acceder achats fournisseurs");

    const opticianSuppliersPage = await page("/suppliers");
    assert.equal(opticianSuppliersPage.res.status, 200, "page fournisseurs opticien doit repondre");
    assert.ok(
      opticianSuppliersPage.text.includes("Acces refuse pour ce role"),
      "page fournisseurs opticien doit afficher acces refuse"
    );

    const opticianOpenShift = await api("/api/reports/daily-cash/shift/open", {
      method: "POST",
      body: { openingCash: 10 }
    });
    assert.equal(opticianOpenShift.res.status, 403, "opticien ne doit pas ouvrir caisse vendeur");

    await loginAs("admin", "admin1234", "re-login admin");

    const adminAccountingPage = await page("/reports/accounting");
    assert.equal(adminAccountingPage.res.status, 200, "page comptabilite admin doit repondre");
    assert.ok(adminAccountingPage.text.includes("Comptabilite"), "page comptabilite admin doit afficher le titre");

    const patientCreate = await api("/api/patients", {
      method: "POST",
      body: {
        firstName: "Test",
        lastName: `Patient-${suffix}`,
        phone: "0666000000"
      }
    });
    assert.equal(patientCreate.res.status, 201, "creation patient echouee");
    const patientId = patientCreate.payload.data.id;

    const sortPatientCreate = await api("/api/patients", {
      method: "POST",
      body: {
        firstName: "Tri",
        lastName: `Date-${suffix}`,
        phone: "0666111111"
      }
    });
    assert.equal(sortPatientCreate.res.status, 201, "creation patient tri date echouee");
    const sortPatientId = sortPatientCreate.payload.data.id;

    const olderSortOrder = await api("/api/orders", {
      method: "POST",
      body: {
        patientId: sortPatientId,
        orderDate: "2024-01-10T12:00:00.000Z",
        items: [{ descriptionSnapshot: `Tri ancien ${suffix}`, qty: 1, unitPrice: 10 }]
      }
    });
    assert.equal(olderSortOrder.res.status, 201, "creation commande ancienne tri echouee");

    const newerSortOrder = await api("/api/orders", {
      method: "POST",
      body: {
        patientId: sortPatientId,
        orderDate: "2024-01-12T12:00:00.000Z",
        items: [{ descriptionSnapshot: `Tri recent ${suffix}`, qty: 1, unitPrice: 20 }]
      }
    });
    assert.equal(newerSortOrder.res.status, 201, "creation commande recente tri echouee");

    const ordersSortPage = await page(`/orders?q=Date-${suffix}`);
    assert.equal(ordersSortPage.res.status, 200, "page commandes triees doit repondre");
    const olderIndex = ordersSortPage.text.indexOf(olderSortOrder.payload.data.number);
    const newerIndex = ordersSortPage.text.indexOf(newerSortOrder.payload.data.number);
    assert.ok(olderIndex >= 0 && newerIndex >= 0, "les commandes tri date doivent apparaitre dans la liste");
    assert.ok(newerIndex < olderIndex, "la commande la plus recente doit apparaitre avant l'ancienne");

    const ordersDateFilteredPage = await page(`/orders?q=Date-${suffix}&from=2024-01-12&to=2024-01-12`);
    assert.equal(ordersDateFilteredPage.res.status, 200, "page commandes filtree par date doit repondre");
    assert.ok(
      ordersDateFilteredPage.text.includes(newerSortOrder.payload.data.number),
      "la commande recente doit apparaitre avec le filtre date"
    );
    assert.equal(
      ordersDateFilteredPage.text.includes(olderSortOrder.payload.data.number),
      false,
      "la commande ancienne ne doit pas apparaitre avec le filtre date"
    );

    const prescriptionCreate = await api("/api/prescriptions", {
      method: "POST",
      body: {
        patientId,
        examDate: new Date().toISOString(),
        odSph: -1.5,
        odCyl: -0.75,
        odAxis: 90,
        osSph: -1.25,
        osCyl: -0.5,
        osAxis: 80,
        pdFar: 62,
        pdNear: 60,
        contactFits: [{ eye: "OD", brand: "TestLens", power: -1.5, baseCurve: 8.6, diameter: 14.2 }]
      }
    });
    assert.equal(prescriptionCreate.res.status, 201, "creation prescription echouee");
    const prescriptionId = prescriptionCreate.payload.data.id;

    const orderCreate = await api("/api/orders", {
      method: "POST",
      body: {
        patientId,
        orderDate: new Date().toISOString(),
        items: [
          {
            productId,
            descriptionSnapshot: `Produit Test ${suffix}`,
            qty: 8,
            unitPrice: 30,
            prescriptionSnapshotJson: {
              id: prescriptionId,
              source: "integration-test",
              od: { sph: -1.5, cyl: -0.75, axis: 90 },
              os: { sph: -1.25, cyl: -0.5, axis: 80 },
              pdFar: 62
            }
          }
        ]
      }
    });
    assert.equal(orderCreate.res.status, 201, "creation commande echouee");
    const orderId = orderCreate.payload.data.id;

    const statuses = ["CONFIRMEE", "EN_ATELIER", "PRETE", "LIVREE"];
    for (const status of statuses) {
      const change = await api(`/api/orders/${orderId}/status`, {
        method: "POST",
        body: { status }
      });
      assert.equal(change.res.status, 200, `transition statut ${status} echouee`);
    }

    const invalidBack = await api(`/api/orders/${orderId}/status`, {
      method: "POST",
      body: { status: "CONFIRMEE" }
    });
    assert.equal(invalidBack.res.status, 409, "retour statut depuis LIVREE devrait etre refuse");

    const deliveryCreate = await api(`/api/orders/${orderId}/delivery-note`, { method: "POST" });
    assert.equal(deliveryCreate.res.status, 201, "creation bon de livraison echouee");
    const deliveryReuse = await api(`/api/orders/${orderId}/delivery-note`, { method: "POST" });
    assert.equal(deliveryReuse.res.status, 200, "regeneration bon de livraison doit reutiliser");
    assert.equal(deliveryReuse.payload.meta?.reused, true, "meta reused BL attendu");
    assert.equal(deliveryReuse.payload.data.id, deliveryCreate.payload.data.id, "BL reutilise attendu");

    const invoiceCreate = await api(`/api/orders/${orderId}/invoice`, { method: "POST" });
    assert.equal(invoiceCreate.res.status, 201, "creation facture client echouee");
    const invoiceReuse = await api(`/api/orders/${orderId}/invoice`, { method: "POST" });
    assert.equal(invoiceReuse.res.status, 200, "regeneration facture doit reutiliser");
    assert.equal(invoiceReuse.payload.meta?.reused, true, "meta reused facture attendu");
    assert.equal(invoiceReuse.payload.data.id, invoiceCreate.payload.data.id, "facture reutilisee attendue");

    const customerPaymentForReceipt = await api(`/api/orders/${orderId}/payments`, {
      method: "POST",
      body: {
        amount: 40,
        method: "CASH",
        paidAt: new Date().toISOString()
      }
    });
    assert.equal(customerPaymentForReceipt.res.status, 201, "paiement client pour recu echoue");
    const paymentIdForReceipt = customerPaymentForReceipt.payload.data.payment.id;

    const receiptCreate = await api(`/api/orders/${orderId}/receipt`, {
      method: "POST",
      body: { paymentId: paymentIdForReceipt }
    });
    assert.equal(receiptCreate.res.status, 201, "creation recu client echouee");
    const receiptReuse = await api(`/api/orders/${orderId}/receipt`, {
      method: "POST",
      body: { paymentId: paymentIdForReceipt }
    });
    assert.equal(receiptReuse.res.status, 200, "regeneration recu doit reutiliser");
    assert.equal(receiptReuse.payload.meta?.reused, true, "meta reused recu attendu");
    assert.equal(receiptReuse.payload.data.id, receiptCreate.payload.data.id, "recu reutilise attendu");

    const deliveryCount = await prisma.deliveryNote.count({ where: { orderId } });
    assert.equal(deliveryCount, 1, "un seul BL attendu par commande");
    const invoiceCount = await prisma.invoice.count({ where: { orderId } });
    assert.equal(invoiceCount, 1, "une seule facture attendue par commande");
    const receiptCount = await prisma.receipt.count({ where: { paymentId: paymentIdForReceipt } });
    assert.equal(receiptCount, 1, "un seul recu attendu par paiement");

    const customerPaymentCancel = await api(`/api/orders/${orderId}/payments/${paymentIdForReceipt}/cancel`, {
      method: "POST",
      body: { reason: "Correction paiement client test" }
    });
    assert.equal(customerPaymentCancel.res.status, 200, "annulation paiement client admin doit reussir");
    const customerPaymentCancelAgain = await api(`/api/orders/${orderId}/payments/${paymentIdForReceipt}/cancel`, {
      method: "POST",
      body: { reason: "Second essai annulation paiement client test" }
    });
    assert.equal(customerPaymentCancelAgain.res.status, 404, "annulation paiement client deja supprime doit etre refusee");

    const orderAfterCustomerPaymentCancel = await prisma.order.findUnique({ where: { id: orderId } });
    assert.ok(orderAfterCustomerPaymentCancel, "commande introuvable apres annulation paiement client");
    assert.equal(
      Number(orderAfterCustomerPaymentCancel.paidAmount.toFixed(2)),
      0,
      "paidAmount commande apres annulation paiement client incorrect"
    );
    assert.equal(
      Number(orderAfterCustomerPaymentCancel.balance.toFixed(2)),
      Number(orderAfterCustomerPaymentCancel.totalAmount.toFixed(2)),
      "balance commande apres annulation paiement client incorrect"
    );
    const receiptAfterCustomerPaymentCancel = await prisma.receipt.count({ where: { paymentId: paymentIdForReceipt } });
    assert.equal(receiptAfterCustomerPaymentCancel, 0, "recu lie au paiement annule doit etre supprime");
    const customerPaymentAfterCancel = await prisma.customerPayment.count({ where: { id: paymentIdForReceipt } });
    assert.equal(customerPaymentAfterCancel, 0, "paiement client annule doit etre supprime");

    const productLots = await prisma.stockLot.findMany({
      where: { productId },
      orderBy: { receivedAt: "asc" }
    });
    const remaining = productLots.reduce((sum, lot) => sum + lot.qtyRemaining, 0);
    assert.equal(Number(remaining.toFixed(2)), 2, "FIFO restant attendu = 2");

    const outMovement = await prisma.stockMovement.findFirst({
      where: {
        productId,
        type: "OUT",
        referenceType: "ORDER",
        referenceId: orderId
      }
    });
    assert.ok(outMovement, "mouvement OUT commande manquant");
    assert.equal(Number(outMovement.unitCost.toFixed(2)), 13.75, "cout moyen FIFO OUT incorrect");

    const createdOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });
    assert.ok(createdOrder, "commande creee introuvable");
    assert.ok(createdOrder.items[0]?.prescriptionSnapshotJson, "snapshot prescription commande manquant");

    const draftOrder = await api("/api/orders", {
      method: "POST",
      body: {
        patientId,
        orderDate: new Date().toISOString(),
        items: [
          {
            productId,
            descriptionSnapshot: `Produit Test ${suffix}`,
            qty: 1,
            unitPrice: 30
          }
        ]
      }
    });
    assert.equal(draftOrder.res.status, 201, "creation commande brouillon echouee");
    const draftInvoice = await api(`/api/orders/${draftOrder.payload.data.id}/invoice`, { method: "POST" });
    assert.equal(draftInvoice.res.status, 409, "facture brouillon doit etre refusee");
    const draftDelivery = await api(`/api/orders/${draftOrder.payload.data.id}/delivery-note`, { method: "POST" });
    assert.equal(draftDelivery.res.status, 409, "BL brouillon doit etre refuse");
    const draftDelete = await api(`/api/orders/${draftOrder.payload.data.id}`, { method: "DELETE" });
    assert.equal(draftDelete.res.status, 200, "suppression brouillon doit etre autorisee");

    const deleteDelivered = await api(`/api/orders/${orderId}`, { method: "DELETE" });
    assert.equal(deleteDelivered.res.status, 409, "suppression commande livree doit etre refusee");

    const poDraftDeleteCreate = await api("/api/purchase-orders", {
      method: "POST",
      body: {
        supplierId,
        orderDate: new Date().toISOString(),
        items: [{ productId, qty: 1, unitCost: 15 }]
      }
    });
    assert.equal(poDraftDeleteCreate.res.status, 201, "creation BC brouillon pour suppression echouee");
    const poDraftDelete = await api(`/api/purchase-orders/${poDraftDeleteCreate.payload.data.id}`, {
      method: "DELETE"
    });
    assert.equal(poDraftDelete.res.status, 200, "suppression BC brouillon doit etre autorisee");

    const poCancelCreate = await api("/api/purchase-orders", {
      method: "POST",
      body: {
        supplierId,
        orderDate: new Date().toISOString(),
        items: [{ productId, qty: 2, unitCost: 15 }]
      }
    });
    assert.equal(poCancelCreate.res.status, 201, "creation BC pour annulation echouee");
    const poCancelId = poCancelCreate.payload.data.id;
    const poCancelConfirm = await api(`/api/purchase-orders/${poCancelId}/confirm`, { method: "POST" });
    assert.equal(poCancelConfirm.res.status, 200, "confirmation BC pour annulation echouee");
    const poCancel = await api(`/api/purchase-orders/${poCancelId}/cancel`, {
      method: "POST",
      body: { reason: "Test annulation BC" }
    });
    assert.equal(poCancel.res.status, 200, "annulation BC confirme doit etre autorisee");

    const poCreate = await api("/api/purchase-orders", {
      method: "POST",
      body: {
        supplierId,
        orderDate: new Date().toISOString(),
        items: [{ productId, qty: 5, unitCost: 15 }]
      }
    });
    assert.equal(poCreate.res.status, 201, "creation bon de commande echouee");
    const purchaseOrderId = poCreate.payload.data.id;

    const poConfirm = await api(`/api/purchase-orders/${purchaseOrderId}/confirm`, { method: "POST" });
    assert.equal(poConfirm.res.status, 200, "confirmation bon de commande echouee");
    const poDeleteConfirmed = await api(`/api/purchase-orders/${purchaseOrderId}`, { method: "DELETE" });
    assert.equal(poDeleteConfirmed.res.status, 409, "suppression BC confirme doit etre refusee");

    const poReceivePartial = await api(`/api/purchase-orders/${purchaseOrderId}/receive`, {
      method: "POST",
      body: { items: [{ productId, qty: 2 }] }
    });
    assert.equal(poReceivePartial.res.status, 200, "reception partielle bon commande echouee");

    const poStockMovements = await prisma.stockMovement.findMany({
      where: {
        type: "IN",
        referenceType: "PURCHASE_ORDER",
        referenceId: purchaseOrderId
      },
      select: { qty: true }
    });
    const receivedAfterPartial = Number(poStockMovements.reduce((sum, mv) => sum + mv.qty, 0).toFixed(2));
    const remainingAfterPartial = Number(Math.max(0, 5 - receivedAfterPartial).toFixed(2));

    if (remainingAfterPartial > 0) {
      const poReceiveRest = await api(`/api/purchase-orders/${purchaseOrderId}/receive`, {
        method: "POST"
      });
      assert.equal(poReceiveRest.res.status, 200, "reception finale bon commande echouee");
    }

    const poOverReceive = await api(`/api/purchase-orders/${purchaseOrderId}/receive`, {
      method: "POST",
      body: { items: [{ productId, qty: 1 }] }
    });
    assert.ok([400, 409].includes(poOverReceive.res.status), "sureception bon commande devrait etre refusee");
    const poCancelReceived = await api(`/api/purchase-orders/${purchaseOrderId}/cancel`, {
      method: "POST",
      body: { reason: "Test annulation BC recu" }
    });
    assert.equal(poCancelReceived.res.status, 409, "annulation BC receptionne doit etre refusee");

    const poInvoice1 = await api("/api/supplier-invoices", {
      method: "POST",
      body: {
        supplierId,
        purchaseOrderId,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        items: [{ productId, qty: 3, unitCost: 15 }]
      }
    });
    assert.equal(poInvoice1.res.status, 201, "facture liee au BC #1 echouee");

    const poInvoice2 = await api("/api/supplier-invoices", {
      method: "POST",
      body: {
        supplierId,
        purchaseOrderId,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        items: [{ productId, qty: 2, unitCost: 15 }]
      }
    });
    assert.equal(poInvoice2.res.status, 201, "facture liee au BC #2 echouee");

    const poInvoiceOver = await api("/api/supplier-invoices", {
      method: "POST",
      body: {
        supplierId,
        purchaseOrderId,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        items: [{ productId, qty: 1, unitCost: 15 }]
      }
    });
    assert.equal(poInvoiceOver.res.status, 409, "surfacturation du BC devrait etre refusee");

    const supplierInvoiceCancellable = await api("/api/supplier-invoices", {
      method: "POST",
      body: {
        supplierId,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        items: [{ productId, qty: 2, unitCost: 15 }]
      }
    });
    assert.equal(supplierInvoiceCancellable.res.status, 201, "creation facture fournisseur annulable echouee");
    const supplierInvoiceCancel = await api(`/api/supplier-invoices/${supplierInvoiceCancellable.payload.data.id}/cancel`, {
      method: "POST",
      body: { reason: "Facture test annulation" }
    });
    assert.equal(supplierInvoiceCancel.res.status, 200, "annulation facture fournisseur sans paiement doit reussir");
    const supplierInvoiceCancelPay = await api(`/api/supplier-invoices/${supplierInvoiceCancellable.payload.data.id}/payments`, {
      method: "POST",
      body: {
        amount: 1,
        method: "CASH",
        paidAt: new Date().toISOString()
      }
    });
    assert.equal(supplierInvoiceCancelPay.res.status, 409, "paiement facture annulee devrait etre refuse");

    const supplierInvoiceSpam = await api("/api/supplier-invoices", {
      method: "POST",
      body: {
        supplierId,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        items: [{ productId, qty: 8, unitCost: 15 }]
      }
    });
    assert.equal(supplierInvoiceSpam.res.status, 201, "creation facture fournisseur anti-double-clic echouee");
    const supplierInvoiceSpamId = supplierInvoiceSpam.payload.data.id;

    const [spamPay1, spamPay2] = await Promise.all([
      api(`/api/supplier-invoices/${supplierInvoiceSpamId}/payments`, {
        method: "POST",
        body: {
          amount: 120,
          method: "CASH",
          paidAt: new Date().toISOString()
        }
      }),
      api(`/api/supplier-invoices/${supplierInvoiceSpamId}/payments`, {
        method: "POST",
        body: {
          amount: 120,
          method: "CASH",
          paidAt: new Date().toISOString()
        }
      })
    ]);

    const spamStatuses = [spamPay1.res.status, spamPay2.res.status].sort((a, b) => a - b);
    assert.deepEqual(spamStatuses, [201, 409], "double paiement simultane doit creer une seule operation");

    const spamInvoiceAfterPay = await prisma.supplierInvoice.findUnique({ where: { id: supplierInvoiceSpamId } });
    assert.ok(spamInvoiceAfterPay, "facture fournisseur anti-double-clic introuvable");
    assert.equal(Number(spamInvoiceAfterPay.balance.toFixed(2)), 0, "solde facture anti-double-clic doit rester a 0");
    assert.equal(spamInvoiceAfterPay.status, "PAID", "statut facture anti-double-clic incorrect");
    const spamPaymentCount = await prisma.supplierPayment.count({
      where: { supplierInvoiceId: supplierInvoiceSpamId }
    });
    assert.equal(spamPaymentCount, 1, "un seul paiement doit etre enregistre pour double-clic");

    const supplierInvoice = await api("/api/supplier-invoices", {
      method: "POST",
      body: {
        supplierId,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        items: [{ productId, qty: 10, unitCost: 15 }]
      }
    });
    assert.equal(supplierInvoice.res.status, 201, "creation facture fournisseur echouee");
    const supplierInvoiceId = supplierInvoice.payload.data.id;

    const supplierPay = await api(`/api/supplier-invoices/${supplierInvoiceId}/payments`, {
      method: "POST",
      body: {
        amount: 60,
        method: "CASH",
        paidAt: new Date().toISOString()
      }
    });
    assert.equal(supplierPay.res.status, 201, "paiement partiel fournisseur echoue");

    const invoiceAfterPay = await prisma.supplierInvoice.findUnique({ where: { id: supplierInvoiceId } });
    assert.ok(invoiceAfterPay, "facture fournisseur introuvable apres paiement");
    assert.equal(Number(invoiceAfterPay.balance.toFixed(2)), 90, "solde facture apres paiement incorrect");
    assert.equal(invoiceAfterPay.status, "PARTIAL", "statut facture apres paiement partiel incorrect");
    const cancelPaidInvoice = await api(`/api/supplier-invoices/${supplierInvoiceId}/cancel`, {
      method: "POST",
      body: { reason: "Facture deja payee partiellement" }
    });
    assert.equal(cancelPaidInvoice.res.status, 409, "annulation facture avec paiement doit etre refusee");

    const overPay = await api(`/api/supplier-invoices/${supplierInvoiceId}/payments`, {
      method: "POST",
      body: {
        amount: 100,
        method: "CASH",
        paidAt: new Date().toISOString()
      }
    });
    assert.equal(overPay.res.status, 409, "surpaiement devrait etre refuse");

    const supplierReturn = await api(`/api/supplier-invoices/${supplierInvoiceId}/returns`, {
      method: "POST",
      body: {
        date: new Date().toISOString(),
        amount: 15,
        items: [{ productId, qty: 1 }]
      }
    });
    assert.equal(supplierReturn.res.status, 201, "retour fournisseur echoue");

    const supplierReturnOverQty = await api(`/api/supplier-invoices/${supplierInvoiceId}/returns`, {
      method: "POST",
      body: {
        date: new Date().toISOString(),
        amount: 150,
        items: [{ productId, qty: 10 }]
      }
    });
    assert.equal(supplierReturnOverQty.res.status, 409, "retour fournisseur en quantite excessive devrait etre refuse");

    const invoiceAfterReturn = await prisma.supplierInvoice.findUnique({ where: { id: supplierInvoiceId } });
    assert.ok(invoiceAfterReturn, "facture fournisseur introuvable apres retour");
    assert.equal(Number(invoiceAfterReturn.totalAmount.toFixed(2)), 135, "total facture apres retour incorrect");
    assert.equal(Number(invoiceAfterReturn.balance.toFixed(2)), 75, "solde facture apres retour incorrect");

    const supplierReturnCancel = await api(`/api/supplier-returns/${supplierReturn.payload.data.supplierReturn.id}/cancel`, {
      method: "POST",
      body: { reason: "Annulation retour test" }
    });
    assert.equal(supplierReturnCancel.res.status, 200, "annulation retour fournisseur echouee");

    const invoiceAfterReturnCancel = await prisma.supplierInvoice.findUnique({ where: { id: supplierInvoiceId } });
    assert.ok(invoiceAfterReturnCancel, "facture fournisseur introuvable apres annulation retour");
    assert.equal(Number(invoiceAfterReturnCancel.totalAmount.toFixed(2)), 150, "total facture apres annulation retour incorrect");
    assert.equal(Number(invoiceAfterReturnCancel.balance.toFixed(2)), 90, "solde facture apres annulation retour incorrect");

    const supplierInvoicePaymentCancelTarget = await api("/api/supplier-invoices", {
      method: "POST",
      body: {
        supplierId,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
        items: [{ productId, qty: 2, unitCost: 15 }]
      }
    });
    assert.equal(
      supplierInvoicePaymentCancelTarget.res.status,
      201,
      "creation facture fournisseur pour annulation paiement echouee"
    );
    const supplierInvoicePaymentCancelId = supplierInvoicePaymentCancelTarget.payload.data.id;

    const supplierPaymentCancelTarget = await api(
      `/api/supplier-invoices/${supplierInvoicePaymentCancelId}/payments`,
      {
        method: "POST",
        body: {
          amount: 10,
          method: "CASH",
          paidAt: new Date().toISOString()
        }
      }
    );
    assert.equal(
      supplierPaymentCancelTarget.res.status,
      201,
      "paiement fournisseur pour annulation admin echoue"
    );
    const supplierPaymentCancelId = supplierPaymentCancelTarget.payload.data.payment.id;

    const supplierPaymentCancel = await api(
      `/api/supplier-invoices/${supplierInvoicePaymentCancelId}/payments/${supplierPaymentCancelId}/cancel`,
      {
        method: "POST",
        body: { reason: "Correction paiement fournisseur test" }
      }
    );
    assert.equal(supplierPaymentCancel.res.status, 200, "annulation paiement fournisseur admin doit reussir");
    const supplierPaymentCancelAgain = await api(
      `/api/supplier-invoices/${supplierInvoicePaymentCancelId}/payments/${supplierPaymentCancelId}/cancel`,
      {
        method: "POST",
        body: { reason: "Second essai annulation paiement fournisseur test" }
      }
    );
    assert.equal(supplierPaymentCancelAgain.res.status, 404, "annulation paiement fournisseur deja supprime doit echouer");

    const invoiceAfterSupplierPaymentCancel = await prisma.supplierInvoice.findUnique({
      where: { id: supplierInvoicePaymentCancelId }
    });
    assert.ok(invoiceAfterSupplierPaymentCancel, "facture fournisseur introuvable apres annulation paiement");
    assert.equal(
      Number(invoiceAfterSupplierPaymentCancel.paidAmount.toFixed(2)),
      0,
      "paidAmount facture apres annulation paiement fournisseur incorrect"
    );
    assert.equal(
      Number(invoiceAfterSupplierPaymentCancel.balance.toFixed(2)),
      Number(invoiceAfterSupplierPaymentCancel.totalAmount.toFixed(2)),
      "balance facture apres annulation paiement fournisseur incorrect"
    );
    assert.equal(
      invoiceAfterSupplierPaymentCancel.status,
      "UNPAID",
      "statut facture apres annulation paiement fournisseur incorrect"
    );
    const supplierPaymentAfterCancel = await prisma.supplierPayment.count({ where: { id: supplierPaymentCancelId } });
    assert.equal(supplierPaymentAfterCancel, 0, "paiement fournisseur annule doit etre supprime");

    const productQtyAfterReturnCancel = await prisma.stockLot.aggregate({
      where: { productId },
      _sum: { qtyRemaining: true }
    });
    assert.equal(
      Number((productQtyAfterReturnCancel._sum.qtyRemaining ?? 0).toFixed(2)),
      7,
      "stock final apres annulation retour incorrect"
    );

    const accountingFrom = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const accountingTo = new Date().toISOString().slice(0, 10);

    const accountingSummary = await api(`/api/reports/accounting/summary?from=${accountingFrom}&to=${accountingTo}`);
    assert.equal(accountingSummary.res.status, 200, "summary accounting admin devrait reussir");
    assert.ok(accountingSummary.payload?.data?.kpis, "summary accounting doit retourner les KPIs");
    assert.equal(
      accountingSummary.payload?.meta?.rangeMaxDays,
      366,
      "summary accounting doit retourner le guardrail max jours"
    );

    const accountingSales = await api(
      `/api/reports/accounting/sales?from=${accountingFrom}&to=${accountingTo}&groupBy=month`
    );
    assert.equal(accountingSales.res.status, 200, "sales accounting admin devrait reussir");
    assert.ok(Array.isArray(accountingSales.payload?.data?.byPeriod), "sales accounting byPeriod invalide");
    assert.ok(Array.isArray(accountingSales.payload?.data?.byCategory), "sales accounting byCategory invalide");
    assert.ok(Array.isArray(accountingSales.payload?.data?.bySeller), "sales accounting bySeller invalide");
    assert.ok(
      accountingSales.payload?.meta?.pagination?.byPeriod,
      "sales accounting devrait exposer meta pagination byPeriod"
    );

    const accountingPurchases = await api(`/api/reports/accounting/purchases?from=${accountingFrom}&to=${accountingTo}`);
    assert.equal(accountingPurchases.res.status, 200, "purchases accounting admin devrait reussir");
    assert.ok(Array.isArray(accountingPurchases.payload?.data?.byMonth), "purchases accounting byMonth invalide");
    assert.ok(Array.isArray(accountingPurchases.payload?.data?.bySupplier), "purchases accounting bySupplier invalide");

    const accountingProfit = await api(`/api/reports/accounting/profit?from=${accountingFrom}&to=${accountingTo}`);
    assert.equal(accountingProfit.res.status, 200, "profit accounting admin devrait reussir");
    assert.equal(
      typeof accountingProfit.payload?.data?.totals?.grossProfit,
      "number",
      "profit accounting total grossProfit invalide"
    );

    const accountingCashflow = await api(
      `/api/reports/accounting/cashflow?from=${accountingFrom}&to=${accountingTo}&groupBy=week`
    );
    assert.equal(accountingCashflow.res.status, 200, "cashflow accounting admin devrait reussir");
    assert.ok(Array.isArray(accountingCashflow.payload?.data?.byPeriod), "cashflow accounting byPeriod invalide");

    const accountingInvalidGroup = await api(
      `/api/reports/accounting/sales?from=${accountingFrom}&to=${accountingTo}&groupBy=quarter`
    );
    assert.equal(accountingInvalidGroup.res.status, 400, "groupBy invalide doit etre refuse");

    const accountingPaginated = await api(
      `/api/reports/accounting/sales?from=${accountingFrom}&to=${accountingTo}&groupBy=month&page=1&pageSize=1`
    );
    assert.equal(accountingPaginated.res.status, 200, "pagination accounting sales devrait reussir");
    assert.equal(
      accountingPaginated.payload?.meta?.pagination?.byPeriod?.pageSize,
      1,
      "pagination accounting sales pageSize invalide"
    );

    const accountingInvalidPage = await api(
      `/api/reports/accounting/sales?from=${accountingFrom}&to=${accountingTo}&groupBy=month&page=0`
    );
    assert.equal(accountingInvalidPage.res.status, 400, "page invalide doit etre refuse");

    const accountingInvalidPageSize = await api(
      `/api/reports/accounting/sales?from=${accountingFrom}&to=${accountingTo}&groupBy=month&pageSize=999`
    );
    assert.equal(accountingInvalidPageSize.res.status, 400, "pageSize trop grande doit etre refusee");

    const accountingRangeTooLarge = await api("/api/reports/accounting/summary?from=2024-01-01&to=2026-12-31");
    assert.equal(accountingRangeTooLarge.res.status, 400, "plage comptable trop large doit etre refusee");

    const accountingExport = await apiRaw(
      `/api/reports/accounting/export?from=${accountingFrom}&to=${accountingTo}&groupBy=month`
    );
    assert.equal(accountingExport.res.status, 200, "export comptabilite admin devrait reussir");
    assert.ok(
      (accountingExport.res.headers.get("content-type") || "").includes("application/vnd.ms-excel"),
      "export comptabilite doit retourner un mime excel"
    );
    assert.ok(
      (accountingExport.res.headers.get("content-disposition") || "").includes("comptabilite-"),
      "export comptabilite doit retourner un nom fichier"
    );

    const dailyCashExport = await apiRaw(`/api/reports/daily-cash/export?date=${accountingTo}`);
    assert.equal(dailyCashExport.res.status, 200, "export caisse journaliere admin devrait reussir");
    assert.ok(
      (dailyCashExport.res.headers.get("content-type") || "").includes("application/vnd.ms-excel"),
      "export caisse journaliere doit retourner un mime excel"
    );
    assert.ok(
      (dailyCashExport.res.headers.get("content-disposition") || "").includes("caisse-journaliere-"),
      "export caisse journaliere doit retourner un nom fichier"
    );

    const supplierAgingExport = await apiRaw("/api/reports/supplier-aging/export");
    assert.equal(supplierAgingExport.res.status, 200, "export echeances fournisseurs admin devrait reussir");
    assert.ok(
      (supplierAgingExport.res.headers.get("content-type") || "").includes("application/vnd.ms-excel"),
      "export echeances fournisseurs doit retourner un mime excel"
    );
    assert.ok(
      (supplierAgingExport.res.headers.get("content-disposition") || "").includes("echeances-fournisseurs-"),
      "export echeances fournisseurs doit retourner un nom fichier"
    );

    console.log(
      "Integration tests passed: backup validate, sequence admin guard, RBAC, seller cash shift close, documents idempotent, prescription, FIFO, PO delete/cancel/receive, supplier invoice cancel rules, returns cancel, payment cancel admin guards, double-click payment guard, payments, transitions, delete-policy, accounting admin reports, excel exports."
    );
  } catch (error) {
    console.error("Integration tests failed.");
    console.error(error instanceof Error ? error.message : error);
    if (serverLogs) {
      console.error("--- server logs ---");
      console.error(serverLogs);
    }
    process.exitCode = 1;
  } finally {
    await stopProcessTree(server.pid);
    await prisma.$disconnect();
  }
}

run();
