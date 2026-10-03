const express=require('express'),Vendor=require('../models/Vendor');
const r=express.Router();
r.get('/',async(req,res,next)=>{try{const q={approved:true,active:true};if(req.query.serviceKey)q.services=String(req.query.serviceKey).toUpperCase();res.json({success:true,vendors:await Vendor.find(q).sort({businessName:1})})}catch(e){next(e)}});
module.exports=r;
