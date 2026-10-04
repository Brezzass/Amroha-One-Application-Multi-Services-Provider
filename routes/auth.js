const express=require('express'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),User=require('../models/User'),Vendor=require('../models/Vendor');
const {auth:requireAuth}=require('../middleware/auth');
const r=express.Router();
const publicUser=u=>({id:u._id,name:u.name,phone:u.phone,email:u.email,role:u.role,vendorId:u.vendorId,deliveryBoyId:u.deliveryBoyId,address:u.address});
const token=u=>jwt.sign({sub:String(u._id),role:u.role},process.env.JWT_SECRET,{expiresIn:'30d'});
r.post('/register',async(req,res,next)=>{try{
 const {name,phone,password,role='CUSTOMER',email='',address={},signupCode='',businessName='',serviceRadiusKm=10,aadhaarNumber='',aadhaarImageData=''}=req.body||{};
 const rr=String(role).toUpperCase(),pp=String(phone||'').trim();
 if(!name||!/^[0-9]{10}$/.test(pp)||String(password||'').length<6)return res.status(400).json({error:'Name, 10-digit phone and password (min 6 characters) are required'});
 if(!['ADMIN','VENDOR','CUSTOMER','DELIVERY_BOY'].includes(rr))return res.status(400).json({error:'Invalid role'});\n if(rr==='VENDOR'){if(!/^\d{12}$/.test(String(aadhaarNumber||'')))return res.status(400).json({error:'Vendor Aadhaar number must be exactly 12 digits'});if(!String(aadhaarImageData||'').startsWith('data:image/')&&!String(aadhaarImageData||'').trim())return res.status(400).json({error:'Vendor identity document photo is required'});const rradius=Number(serviceRadiusKm);if(!Number.isFinite(rradius)||rradius<1||rradius>100)return res.status(400).json({error:'Vendor service radius must be between 1 and 100 km'});}
 if(rr==='ADMIN'&&(!process.env.ADMIN_SIGNUP_CODE||String(signupCode)!==String(process.env.ADMIN_SIGNUP_CODE)))return res.status(403).json({error:'Admin registration is restricted'});
 if(await User.exists({phone:pp}))return res.status(409).json({error:'Phone already registered'});
 const u=await User.create({name:String(name).trim(),phone:pp,passwordHash:await bcrypt.hash(String(password),12),email:String(email||'').trim(),address,role:rr,active:true,aadhaarNumber:rr==='VENDOR'?String(aadhaarNumber):'',aadhaarImageData:rr==='VENDOR'?String(aadhaarImageData):'',identityDocumentUpdatedAt:rr==='VENDOR'?new Date():undefined});
 if(rr==='VENDOR'){const vendorId='V'+Date.now().toString().slice(-8);const rradius=Number(serviceRadiusKm);await Vendor.create({vendorId,userId:u._id,businessName:String(businessName||u.name).trim(),services:['TIFFIN'],approved:false,active:true,acceptingOrders:true,serviceRadiusKm:rradius,address:u.address||{}});u.vendorId=vendorId;await u.save();}
 if(rr==='DELIVERY_BOY'){u.deliveryBoyId='D'+Date.now().toString().slice(-8);await u.save();}
 res.status(201).json({success:true,token:token(u),user:publicUser(u),message:rr==='VENDOR'?'Vendor account created. Waiting for approval.':'Account created'});
}catch(e){next(e)}});
r.post('/login',async(req,res,next)=>{try{
 const pp=String(req.body?.phone||'').trim(),pw=String(req.body?.password||'');const u=await User.findOne({phone:pp});
 if(!u||!u.active||!(await bcrypt.compare(pw,u.passwordHash)))return res.status(401).json({error:'Invalid phone or password'});
 let approved=true;if(u.role==='VENDOR'){const v=await Vendor.findOne({vendorId:u.vendorId});approved=Boolean(v&&v.approved&&v.active);}
 res.json({success:true,token:token(u),user:publicUser(u),approved});
}catch(e){next(e)}});
r.put('/password',requireAuth,async(req,res,next)=>{try{
 const current=String(req.body?.currentPassword||''),nextPw=String(req.body?.newPassword||'');
 if(nextPw.length<6)return res.status(400).json({error:'New password must be at least 6 characters'});
 if(!(await bcrypt.compare(current,req.user.passwordHash)))return res.status(401).json({error:'Current password is incorrect'});
 req.user.passwordHash=await bcrypt.hash(nextPw,12);await req.user.save();res.json({success:true,message:'Password updated'});
}catch(e){next(e)}});
module.exports=r;