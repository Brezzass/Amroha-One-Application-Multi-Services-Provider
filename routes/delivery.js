const express=require('express'),User=require('../models/User'),Order=require('../models/Order'),{auth,roles}=require('../middleware/auth');
const r=express.Router();
r.get('/available',auth,roles('ADMIN','VENDOR'),async(req,res,next)=>{try{const users=await User.find({role:'DELIVERY_BOY',active:true}).select('-passwordHash');res.json({success:true,deliveryBoys:users})}catch(e){next(e)}});
r.get('/mine',auth,roles('DELIVERY_BOY'),async(req,res,next)=>{try{res.json({success:true,orders:await Order.find({deliveryBoyId:req.user.deliveryBoyId}).sort({createdAt:-1})})}catch(e){next(e)}});module.exports=r;
