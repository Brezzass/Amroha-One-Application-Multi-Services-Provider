const express=require('express');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const User=require('../models/User');
const Vendor=require('../models/Vendor');
const {auth:requireAuth}=require('../middleware/auth');

const r=express.Router();

const publicUser=(u)=>({
  id:u._id,
  name:u.name||'',
  phone:u.phone||'',
  email:u.email||'',
  dob:u.dob||'',
  role:u.role,
  vendorId:u.vendorId||'',
  deliveryBoyId:u.deliveryBoyId||'',
  address:u.address||{}
});

const makeToken=(u)=>jwt.sign(
  {sub:String(u._id),role:u.role},
  process.env.JWT_SECRET,
  {expiresIn:'30d'}
);

r.post('/register',async(req,res,next)=>{
  try{
    const b=req.body||{};
    const name=String(b.name||'').trim();
    const phone=String(b.phone||'').trim();
    const password=String(b.password||'');
    const role=String(b.role||'CUSTOMER').toUpperCase();

    if(!name||!/^[0-9]{10}$/.test(phone)||password.length<6)
      return res.status(400).json({error:'Name, 10-digit phone and password (min 6 characters) are required'});
    if(!['ADMIN','VENDOR','CUSTOMER','DELIVERY_BOY'].includes(role))
      return res.status(400).json({error:'Invalid role'});
    if(role==='ADMIN'&&(!process.env.ADMIN_SIGNUP_CODE||String(b.signupCode||'')!==String(process.env.ADMIN_SIGNUP_CODE)))
      return res.status(403).json({error:'Admin registration is restricted'});
    if(await User.exists({phone}))
      return res.status(409).json({error:'Phone already registered'});

    if(role==='VENDOR'){
      if(!/^\d{12}$/.test(String(b.aadhaarNumber||'')))
        return res.status(400).json({error:'Vendor Aadhaar number must be exactly 12 digits'});
      const radius=Number(b.serviceRadiusKm||10);
      if(!Number.isFinite(radius)||radius<1||radius>100)
        return res.status(400).json({error:'Vendor service radius must be between 1 and 100 km'});
    }

    const u=await User.create({
      name,phone,
      passwordHash:await bcrypt.hash(password,12),
      email:String(b.email||'').trim(),
      dob:String(b.dob||'').trim(),
      address:b.address||{},
      role,active:true,
      aadhaarNumber:role==='VENDOR'?String(b.aadhaarNumber||''):'',
      aadhaarImageData:role==='VENDOR'?String(b.aadhaarImageData||''):''
    });

    if(role==='VENDOR'){
      const vendorId='V'+Date.now().toString().slice(-8);
      const radius=Number(b.serviceRadiusKm||10);
      await Vendor.create({
        vendorId,userId:u._id,
        businessName:String(b.businessName||name).trim(),
        services:['TIFFIN'],approved:false,active:true,
        acceptingOrders:true,serviceRadiusKm:radius,address:u.address||{}
      });
      u.vendorId=vendorId;
      await u.save();
    }

    if(role==='DELIVERY_BOY'){
      u.deliveryBoyId='D'+Date.now().toString().slice(-8);
      await u.save();
    }

    res.status(201).json({success:true,token:makeToken(u),user:publicUser(u),message:role==='VENDOR'?'Vendor account created. Waiting for approval.':'Account created'});
  }catch(e){next(e)}
});

r.post('/login',async(req,res,next)=>{
  try{
    const phone=String(req.body?.phone||'').trim();
    const password=String(req.body?.password||'');
    const u=await User.findOne({phone});
    if(!u||!u.active||!(await bcrypt.compare(password,u.passwordHash)))
      return res.status(401).json({error:'Invalid phone or password'});

    let approved=true;
    if(u.role==='VENDOR'){
      const v=await Vendor.findOne({vendorId:u.vendorId});
      approved=Boolean(v&&v.approved&&v.active);
    }
    res.json({success:true,token:makeToken(u),user:publicUser(u),approved});
  }catch(e){next(e)}
});

r.get('/me',requireAuth,async(req,res)=>{
  res.json({success:true,user:publicUser(req.user)});
});

r.put('/profile',requireAuth,async(req,res,next)=>{
  try{
    const b=req.body||{};
    if(b.name!==undefined){
      const name=String(b.name||'').trim();
      if(!name)return res.status(400).json({error:'Name is required'});
      req.user.name=name;
    }
    if(b.email!==undefined)req.user.email=String(b.email||'').trim();
    if(b.dob!==undefined)req.user.dob=String(b.dob||'').trim();
    if(b.address&&typeof b.address==='object'){
      const a=b.address;
      const old=req.user.address||{};
      req.user.address={
        line1:String(a.line1??old.line1??'').trim(),
        city:String(a.city??old.city??'').trim(),
        postOffice:String(a.postOffice??old.postOffice??'').trim(),
        pincode:String(a.pincode??old.pincode??'').trim(),
        lat:Number.isFinite(Number(a.lat))?Number(a.lat):old.lat,
        lng:Number.isFinite(Number(a.lng))?Number(a.lng):old.lng,
        geoTagged:a.geoTagged!==undefined?Boolean(a.geoTagged):Boolean(old.geoTagged)
      };
    }
    await req.user.save();
    res.json({success:true,message:'Profile updated',user:publicUser(req.user)});
  }catch(e){next(e)}
});

r.put('/password',requireAuth,async(req,res,next)=>{
  try{
    const current=String(req.body?.currentPassword||'');
    const nextPassword=String(req.body?.newPassword||'');
    if(nextPassword.length<6)return res.status(400).json({error:'New password must be at least 6 characters'});
    if(!(await bcrypt.compare(current,req.user.passwordHash)))
      return res.status(401).json({error:'Current password is incorrect'});
    req.user.passwordHash=await bcrypt.hash(nextPassword,12);
    await req.user.save();
    res.json({success:true,message:'Password updated'});
  }catch(e){next(e)}
});

module.exports=r;
