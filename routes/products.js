const express=require('express'),Product=require('../models/Product'),{auth,roles}=require('../middleware/auth');
const r=express.Router();
const legacyKeyOk=req=>Boolean((req.get('X-API-Key')||'').trim());

r.post('/vendor',async(req,res,next)=>{if(!legacyKeyOk(req))return res.status(401).json({error:'Invalid API key'});try{
  const vendorId=String(req.body.vendorId||'V1');
  const p=await Product.create({...req.body,vendorId,serviceKey:String(req.body.serviceKey||'TIFFIN').toUpperCase(),active:true});
  res.status(201).json({success:true,product:p});
}catch(e){next(e)}});

r.put('/vendor/:id',async(req,res,next)=>{if(!legacyKeyOk(req))return res.status(401).json({error:'Invalid API key'});try{
  const p=await Product.findById(req.params.id);if(!p)return res.status(404).json({error:'Product not found'});
  if(String(p.vendorId)!==String(req.body.vendorId||'V1'))return res.status(403).json({error:'Not your product'});
  for(const k of ['name','description','category','imageUrl','price','unit','stock','active','options'])if(req.body[k]!==undefined)p[k]=req.body[k];
  await p.save();res.json({success:true,product:p});
}catch(e){next(e)}});

r.delete('/vendor/:id',async(req,res,next)=>{if(!legacyKeyOk(req))return res.status(401).json({error:'Invalid API key'});try{
  const p=await Product.findById(req.params.id);if(!p)return res.status(404).json({error:'Product not found'});
  if(String(p.vendorId)!==String(req.query.vendorId||'V1'))return res.status(403).json({error:'Not your product'});
  p.active=false;await p.save();res.json({success:true});
}catch(e){next(e)}});

function own(req,p){return req.user.role!=='VENDOR'||p.vendorId===req.user.vendorId}
r.get('/',async(req,res,next)=>{try{const f={};if(req.query.serviceKey)f.serviceKey=req.query.serviceKey.toUpperCase();if(req.query.vendorId)f.vendorId=req.query.vendorId;if(req.query.includeInactive!=='true')f.active=true;res.json({success:true,products:await Product.find(f).sort({category:1,name:1})})}catch(e){next(e)}});
r.post('/',auth,roles('ADMIN','VENDOR'),async(req,res,next)=>{try{const vendorId=req.user.role==='VENDOR'?req.user.vendorId:req.body.vendorId;if(!vendorId)return res.status(400).json({error:'vendorId required'});const p=await Product.create({...req.body,vendorId,serviceKey:String(req.body.serviceKey||'TIFFIN').toUpperCase()});res.status(201).json({success:true,product:p})}catch(e){next(e)}});
r.put('/:id',auth,roles('ADMIN','VENDOR'),async(req,res,next)=>{try{const p=await Product.findById(req.params.id);if(!p)return res.status(404).json({error:'Product not found'});if(!own(req,p))return res.status(403).json({error:'Not your product'});for(const k of ['name','description','category','imageUrl','price','unit','stock','active','options'])if(req.body[k]!==undefined)p[k]=req.body[k];await p.save();res.json({success:true,product:p})}catch(e){next(e)}});
r.delete('/:id',auth,roles('ADMIN','VENDOR'),async(req,res,next)=>{try{const p=await Product.findById(req.params.id);if(!p)return res.status(404).json({error:'Product not found'});if(!own(req,p))return res.status(403).json({error:'Not your product'});p.active=false;await p.save();res.json({success:true})}catch(e){next(e)}});
module.exports=r;
