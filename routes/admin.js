const express=require('express'),User=require('../models/User'),Vendor=require('../models/Vendor'),Order=require('../models/Order'),Service=require('../models/Service'),{auth,roles}=require('../middleware/auth');
const r=express.Router();r.use(auth,roles('ADMIN'));
r.get('/dashboard',async(req,res,next)=>{try{const [users,vendors,orders,activeOrders]=await Promise.all([User.countDocuments(),Vendor.countDocuments(),Order.countDocuments(),Order.countDocuments({status:{$nin:['DELIVERED','CANCELLED']}})]);res.json({success:true,users,vendors,orders,activeOrders})}catch(e){next(e)}});
r.get('/users',async(req,res,next)=>{try{res.json({success:true,users:await User.find().select('-passwordHash')})}catch(e){next(e)}});
r.get('/vendors',async(req,res,next)=>{try{res.json({success:true,vendors:await Vendor.find().sort({createdAt:-1})})}catch(e){next(e)}});
r.put('/vendors/:vendorId/approval',async(req,res,next)=>{try{const v=await Vendor.findOneAndUpdate({vendorId:req.params.vendorId},{$set:{approved:Boolean(req.body.approved),active:req.body.active===undefined?true:Boolean(req.body.active)}},{new:true});if(!v)return res.status(404).json({error:'Vendor not found'});res.json({success:true,vendor:v})}catch(e){next(e)}});
r.get('/services',async(req,res,next)=>{try{res.json({success:true,services:await Service.find().sort({sortOrder:1})})}catch(e){next(e)}});module.exports=r;
