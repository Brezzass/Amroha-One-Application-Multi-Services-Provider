const express=require('express'),Vendor=require('../models/Vendor'),User=require('../models/User'),Product=require('../models/Product'),{auth,roles}=require('../middleware/auth');
const r=express.Router();
r.get('/',async(req,res,next)=>{try{
  const q={approved:true,active:true};if(req.query.serviceKey)q.services=String(req.query.serviceKey).toUpperCase();
  const vs=await Vendor.find(q).sort({businessName:1});
  const vendors=await Promise.all(vs.map(async v=>{const u=v.userId?await User.findById(v.userId).select('name phone email address'):null;return {
    vendorId:v.vendorId,businessName:v.businessName,services:v.services,address:v.address,
    contact:{name:u?.name||v.businessName,phone:u?.phone||'',email:u?.email||''}
  }}));
  res.json({success:true,vendors});
}catch(e){next(e)}});

r.get('/:vendorId',async(req,res,next)=>{try{
  const v=await Vendor.findOne({vendorId:req.params.vendorId,approved:true,active:true});if(!v)return res.status(404).json({error:'Vendor not found'});
  const u=v.userId?await User.findById(v.userId).select('name phone email address'):null;
  const products=await Product.find({vendorId:v.vendorId,active:true}).sort({category:1,name:1});
  res.json({success:true,vendor:{vendorId:v.vendorId,businessName:v.businessName,services:v.services,address:v.address,contact:{name:u?.name||v.businessName,phone:u?.phone||'',email:u?.email||''}},products});
}catch(e){next(e)}});

r.put('/me',auth,roles('VENDOR'),async(req,res,next)=>{try{
  const v=await Vendor.findOne({vendorId:req.user.vendorId});if(!v)return res.status(404).json({error:'Vendor profile not found'});
  for(const k of ['businessName','services','address'])if(req.body[k]!==undefined)v[k]=req.body[k];
  await v.save();
  if(req.body.businessName!==undefined){req.user.name=String(req.body.businessName);await req.user.save();}
  res.json({success:true,vendor:v});
}catch(e){next(e)}});
module.exports=r;
