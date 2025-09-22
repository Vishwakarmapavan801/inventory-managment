


const express = require("express");
const fileUpload = require("express-fileupload");
const inventoryRoutes = require("./routes/inventory");

const app = express();


app.use(express.json());
app.use(fileUpload());


app.use("/api/inventory", inventoryRoutes);


const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Shadow Server is running on http://localhost:${PORT}`);
});
