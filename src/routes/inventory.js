





const express = require("express");
const mysql = require("mysql2");
const csv = require("fast-csv");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const LOW_STOCK_THRESHOLD = 10;


const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Admin",       
  database: "inventory_db", 
});

db.connect((err) => {
  if (err) console.error("Shadow DB connection failed:", err);
  else console.log("Shadow Connected to MySQL Database");
});




router.get("/", (req, res) => {
  res.json({ message: "Shadow Inventory API is working!" });
});


router.get("/products", (req, res) => {
  const sql = `
    SELECT v.id AS variant_id, v.sku, v.size, v.color, v.price, v.stock_quantity, 
           p.id AS product_id, p.name AS product_name
    FROM variants v
    JOIN products p ON v.product_id = p.id
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: "Error fetching products" });

    const response = results.map((v) => ({
      product_id: v.product_id,
      product_name: v.product_name,
      variant_id: v.variant_id,
      sku: v.sku,
      size: v.size,
      color: v.color,
      price: v.price,
      stock_quantity: v.stock_quantity,
      low_stock: v.stock_quantity < LOW_STOCK_THRESHOLD,
    }));

    res.json(response);
  });
});



router.post("/products", async (req, res) => {
  const { name, variants } = req.body;

  if (!name || !variants || !variants.length)
    return res.status(400).json({ error: "Product name and at least one variant are required" });

  try {
  
    db.query("INSERT INTO products (name) VALUES (?) ON DUPLICATE KEY UPDATE name = ?", [name, name], (err, productResult) => {
      if (err) return res.status(500).json({ error: err.message });

      const productId = productResult.insertId;

      variants.forEach((variant) => {
        db.query(
          "INSERT INTO variants (product_id, sku, size, color, price, stock_quantity) VALUES (?, ?, ?, ?, ?, ?)",
          [productId, variant.sku, variant.size, variant.color, variant.price, variant.stock_quantity]
        );
      });

      res.status(201).json({ message: " Product and variants added successfully" });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.put("/variants/:id/stock", (req, res) => {
  const { id } = req.params;
  const { stock_quantity } = req.body;

  db.query("UPDATE variants SET stock_quantity = ? WHERE id = ?", [stock_quantity, id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: "Variant not found" });
    res.json({ message: " Stock updated successfully" });
  });
});


router.delete("/products/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM products WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: "Product not found" });
    res.json({ message: " Product deleted successfully" });
  });
});



router.post("/import", (req, res) => {
  if (!req.files || !req.files.csvFile)
    return res.status(400).json({ error: "No CSV file uploaded" });

  const fileRows = [];
  const csvStream = csv.parse({ headers: true })
    .on("data", (row) => fileRows.push(row))
    .on("end", () => {
      fileRows.forEach((row) => {
        db.query("INSERT INTO products (name) VALUES (?) ON DUPLICATE KEY UPDATE name = ?", [row.product_name, row.product_name], (err, productResult) => {
          if (err) return;

          const productId = productResult.insertId;
          db.query(
            "INSERT INTO variants (product_id, sku, size, color, price, stock_quantity) VALUES (?, ?, ?, ?, ?, ?)",
            [productId, row.sku, row.size, row.color, parseFloat(row.price), parseInt(row.stock_quantity)]
          );
        });
      });
      res.json({ message: " CSV imported successfully" });
    });

  req.files.csvFile.data.pipe(csvStream);
});



router.get("/export", (req, res) => {
  const sql = `
    SELECT v.id AS variant_id, v.sku, v.size, v.color, v.price, v.stock_quantity, 
           p.id AS product_id, p.name AS product_name
    FROM variants v
    JOIN products p ON v.product_id = p.id
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    const csvStream = csv.format({ headers: true });
    const filePath = path.join(__dirname, "inventory_export.csv");
    const writableStream = fs.createWriteStream(filePath);

    csvStream.pipe(writableStream);
    results.forEach((v) => {
      csvStream.write({
        product_name: v.product_name,
        sku: v.sku,
        size: v.size,
        color: v.color,
        price: v.price,
        stock_quantity: v.stock_quantity,
      });
    });
    csvStream.end();

    writableStream.on("finish", () => {
      res.download(filePath, "inventory_export.csv", (err) => {
        if (err) return res.status(500).json({ error: err.message });
        fs.unlinkSync(filePath);
      });
    });
  });
});

module.exports = router;
