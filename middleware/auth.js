const jwt=require('jsonwebtoken'),User=require('../models/User');
async function auth(req,res,next){try{const h=req.get('Authorization')||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'Login required'});const p=jwt.verify(h.slice(7),process.env.JWT_SECRET);const u=await User.findById(p.sub);if(!u||!u.active)return res.status(401).json({error:'Account inactive or not found'});req.user=u;next()}catch(e){return res.status(401).json({error:'Invalid or expired token'})}}
const roles=(...rs)=>(req,res,next)=>rs.includes(req.user.role)?next():res.status(403).json({error:'Permission denied'});
module.exports={auth,roles};
