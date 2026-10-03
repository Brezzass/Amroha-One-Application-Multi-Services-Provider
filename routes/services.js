const express=require('express'),Service=require('../models/Service'),{auth,roles}=require('../middleware/auth');
const r=express.Router();
r.get('/',async(req,res,next)=>{try{res.json({success:true,services:await Service.find().sort({sortOrder:1})})}catch(e){next(e)}});
r.put('/:key',auth,roles('ADMIN'),async(req,res,next)=>{try{const s=await Service.findOneAndUpdate({key:req.params.key.toUpperCase()},{$set:req.body},{new:true});if(!s)return res.status(404).json({error:'Service not found'});res.json({success:true,service:s})}catch(e){next(e)}});module.exports=r;
