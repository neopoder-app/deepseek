const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

let produtos = [
  {
    id: 1,
    nome: "Camisa Brasil 2026",
    preco: 179.90,
    imagem: "https://via.placeholder.com/200"
  },
  {
    id: 2,
    nome: "Camisa Real Madrid",
    preco: 189.90,
    imagem: "https://via.placeholder.com/200"
  }
];

// API produtos
app.get("/produtos", (req, res) => {
  res.json(produtos);
});

// servidor
app.listen(3001, () => {
  console.log("🔥 Rodando em http://localhost:3001");
});