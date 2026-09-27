require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false } });

const uploadDir = path.join(__dirname, "public", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype))
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

async function db(text, params=[]) {
  const result = await pool.query(text, params);
  return result;
}
function sign(user) {
  return jwt.sign({ id:user.id, email:user.email, role:user.role, name:user.name }, process.env.JWT_SECRET, { expiresIn:"7d" });
}
function auth(req,res,next) {
  try {
    const token=req.cookies.katalan_token;
    if(!token) return res.status(401).json({error:"Connexion requise."});
    req.user=jwt.verify(token,process.env.JWT_SECRET); next();
  } catch { res.status(401).json({error:"Session expirée."}); }
}
function admin(req,res,next) {
  if(req.user?.role!=="admin") return res.status(403).json({error:"Accès administrateur requis."});
  next();
}

app.get("/api/health", (_,res)=>res.json({ok:true,service:"KATALAN"}));

app.post("/api/register", async (req,res)=>{
  try {
    const {name,email,phone,password}=req.body;
    if(!name||!email||!password||password.length<6) return res.status(400).json({error:"Nom, email et mot de passe de 6 caractères minimum requis."});
    const hash=await bcrypt.hash(password,12);
    const r=await db("INSERT INTO users(name,email,phone,password_hash) VALUES($1,$2,$3,$4) RETURNING id,name,email,phone,role",[name,email.toLowerCase(),phone||null,hash]);
    const user=r.rows[0];
    res.cookie("katalan_token",sign(user),{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*864e5});
    res.json({user});
  } catch(e) {
    if(e.code==="23505") return res.status(409).json({error:"Cet email est déjà utilisé."});
    res.status(500).json({error:"Erreur serveur."});
  }
});

app.post("/api/login", async (req,res)=>{
  try {
    const {email,password}=req.body;
    const r=await db("SELECT * FROM users WHERE email=$1",[String(email||"").toLowerCase()]);
    if(!r.rows[0] || !(await bcrypt.compare(password||"",r.rows[0].password_hash))) return res.status(401).json({error:"Email ou mot de passe incorrect."});
    const u=r.rows[0];
    const user={id:u.id,name:u.name,email:u.email,phone:u.phone,role:u.role};
    res.cookie("katalan_token",sign(user),{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*864e5});
    res.json({user});
  } catch { res.status(500).json({error:"Erreur serveur."}); }
});

app.post("/api/logout",(req,res)=>{res.clearCookie("katalan_token");res.json({ok:true});});
app.get("/api/me",auth,async(req,res)=>{
  const r=await db("SELECT id,name,email,phone,role,created_at FROM users WHERE id=$1",[req.user.id]);
  res.json({user:r.rows[0]});
});

app.get("/api/listings",async(req,res)=>{
  const {q="",category="",city="",status="approved"}=req.query;
  const values=[]; const where=[];
  if(status) {values.push(status);where.push(`l.status=$${values.length}`);}
  if(q){values.push(`%${q}%`);where.push(`(l.title ILIKE $${values.length} OR l.description ILIKE $${values.length})`);}
  if(category){values.push(category);where.push(`l.category=$${values.length}`);}
  if(city){values.push(city);where.push(`l.city=$${values.length}`);}
  const sql=`SELECT l.id,l.title,l.description,l.price,l.category,l.city,l.contact,l.image_url,l.created_at,u.name seller
    FROM listings l JOIN users u ON u.id=l.user_id ${where.length?"WHERE "+where.join(" AND "):""}
    ORDER BY l.created_at DESC LIMIT 100`;
  res.json({listings:(await db(sql,values)).rows});
});

app.post("/api/listings",auth,upload.single("image"),async(req,res)=>{
  try {
    const {title,description,price,category,city,contact}=req.body;
    if(!title||!category||!city) return res.status(400).json({error:"Titre, catégorie et ville requis."});
    const image_url=req.file?"/uploads/"+req.file.filename:null;
    const r=await db(`INSERT INTO listings(user_id,title,description,price,category,city,contact,image_url)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id,title,description||"",Number(price)||0,category,city,contact||"",image_url]);
    res.status(201).json({listing:r.rows[0],message:"Annonce envoyée pour modération."});
  } catch {res.status(500).json({error:"Impossible de créer l'annonce."});}
});

app.post("/api/favorites/:id",auth,async(req,res)=>{
  try { await db("INSERT INTO favorites(user_id,listing_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.user.id,req.params.id]); res.json({ok:true}); }
  catch {res.status(500).json({error:"Erreur favori."});}
});
app.delete("/api/favorites/:id",auth,async(req,res)=>{
  await db("DELETE FROM favorites WHERE user_id=$1 AND listing_id=$2",[req.user.id,req.params.id]);res.json({ok:true});
});
app.get("/api/favorites",auth,async(req,res)=>{
  const r=await db(`SELECT l.* FROM favorites f JOIN listings l ON l.id=f.listing_id WHERE f.user_id=$1 ORDER BY l.created_at DESC`,[req.user.id]);res.json({listings:r.rows});
});

app.get("/api/admin/pending",auth,admin,async(req,res)=>{
  const r=await db(`SELECT l.*,u.name seller,u.email FROM listings l JOIN users u ON u.id=l.user_id WHERE l.status='pending' ORDER BY l.created_at ASC`);
  res.json({listings:r.rows});
});
app.patch("/api/admin/listings/:id",auth,admin,async(req,res)=>{
  const {status}=req.body;
  if(!["approved","rejected"].includes(status)) return res.status(400).json({error:"Statut invalide."});
  const r=await db("UPDATE listings SET status=$1 WHERE id=$2 RETURNING *",[status,req.params.id]);
  res.json({listing:r.rows[0]});
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`KATALAN running on port ${PORT}`));
