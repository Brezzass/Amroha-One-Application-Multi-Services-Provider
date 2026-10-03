const express=require('express'),crypto=require('crypto'),Order=require('../models/Order'),Product=require('../models/Product'),Vendor=require('../models/Vendor'),User=require('../models/User'),{auth,roles}=require('../middleware/auth');
const r=express.Router();
const no=()=>`AO-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const otp=()=>String(100000+crypto.randomInt(900000));
const transitions={
 PENDING:['ACCEPTED','CANCELLED'],
 ACCEPTED:['PREPARING','CANCELLED'],
 PREPARING:['READY','CANCELLED'],
 READY:['OUT_FOR_DELIVERY','CANCELLED'],
 OUT_FOR_DELIVERY:['DELIVERED'],
 DELIVERED:[],
 CANCELLED:[]
};
const canTransition=(from,to)=>transitions[from]&&transitions[from].includes(to);
const publicOrder=async o=>{const v=await Vendor.findOne({vendorId:o.vendorId}).select('businessName vendorId');return {...o.toObject(),vendorName:v?.businessName||o.vendorId};};

r.post('/',auth,roles('CUSTOMER'),async(req,res,next)=>{try{
 const {vendorId,serviceKey='TIFFIN',items=[],deliveryAddress,paymentType='COD'}=req.body;
 if(!vendorId||!items.length||!deliveryAddress?.lat||!deliveryAddress?.lng)return res.status(400).json({error:'vendorId, items and geotagged deliveryAddress are required'});
 if(!['COD','UPI'].includes(paymentType))return res.status(400).json({error:'Invalid payment type'});
 const v=await Vendor.findOne({vendorId,approved:true,active:true});
 if(!v)return res.status(400).json({error:'Vendor unavailable or not approved'});
 const ids=items.map(x=>x.productId);
 const ps=await Product.find({_id:{$in:ids},vendorId,serviceKey:String(serviceKey).toUpperCase(),active:true});
 if(ps.length!==items.length)return res.status(400).json({error:'One or more products unavailable'});
 let subtotal=0;const finalItems=[];
 for(const x of items){const p=ps.find(z=>String(z._id)===String(x.productId));const qty=Number(x.qty||1);if(!Number.isInteger(qty)||qty<1)return res.status(400).json({error:'Invalid quantity'});if(p.stock<qty)return res.status(400).json({error:`Insufficient stock for ${p.name}`});subtotal+=p.price*qty;finalItems.push({productId:p._id,name:p.name,qty,unitPrice:p.price,options:x.options||{}});}
 for(const x of items){const p=ps.find(z=>String(z._id)===String(x.productId));p.stock-=Number(x.qty||1);await p.save();}
 const o=await Order.create({orderNo:no(),customerId:req.user._id,vendorId,serviceKey:String(serviceKey).toUpperCase(),items:finalItems,deliveryAddress,subtotal,grandTotal:subtotal,paymentType,paymentStatus:paymentType==='COD'?'PENDING':'PENDING',status:'PENDING',deliveryOtp:otp()});
 res.status(201).json({success:true,message:'Order created',order:await publicOrder(o)});
 }catch(e){next(e)}});

r.get('/mine',auth,roles('CUSTOMER'),async(req,res,next)=>{try{const os=await Order.find({customerId:req.user._id}).sort({createdAt:-1});res.json({success:true,orders:await Promise.all(os.map(publicOrder))})}catch(e){next(e)}});

r.get('/vendor',auth,roles('VENDOR'),async(req,res,next)=>{try{const os=await Order.find({vendorId:req.user.vendorId}).sort({createdAt:-1});res.json({success:true,orders:await Promise.all(os.map(publicOrder))})}catch(e){next(e)}});

r.get('/admin',auth,roles('ADMIN'),async(req,res,next)=>{try{const os=await Order.find().sort({createdAt:-1}).limit(500);res.json({success:true,orders:await Promise.all(os.map(publicOrder))})}catch(e){next(e)}});

r.get('/delivery/available',auth,roles('ADMIN','VENDOR'),async(req,res,next)=>{try{const users=await User.find({role:'DELIVERY_BOY',active:true}).select('-passwordHash');res.json({success:true,deliveryBoys:users})}catch(e){next(e)}});

r.get('/delivery/mine',auth,roles('DELIVERY_BOY'),async(req,res,next)=>{try{const os=await Order.find({deliveryBoyId:req.user.deliveryBoyId,status:{$nin:['DELIVERED','CANCELLED']}}).sort({createdAt:-1});res.json({success:true,orders:await Promise.all(os.map(publicOrder))})}catch(e){next(e)}});

r.put('/:id/status',auth,roles('ADMIN','VENDOR','DELIVERY_BOY'),async(req,res,next)=>{try{
 const o=await Order.findById(req.params.id);if(!o)return res.status(404).json({error:'Order not found'});
 const nextStatus=String(req.body.status||'').toUpperCase();
 if(!canTransition(o.status,nextStatus))return res.status(400).json({error:`Invalid order transition: ${o.status} -> ${nextStatus}`});
 if(req.user.role==='VENDOR'&&o.vendorId!==req.user.vendorId)return res.status(403).json({error:'Not your order'});
 if(req.user.role==='DELIVERY_BOY'&&o.deliveryBoyId!==req.user.deliveryBoyId)return res.status(403).json({error:'Not assigned to you'});
 if(req.user.role==='VENDOR'&&!['ACCEPTED','PREPARING','READY','CANCELLED'].includes(nextStatus))return res.status(403).json({error:'Vendor cannot set this status'});
 if(req.user.role==='DELIVERY_BOY'&&!['OUT_FOR_DELIVERY','DELIVERED'].includes(nextStatus))return res.status(403).json({error:'Delivery Boy cannot set this status'});
 if(nextStatus==='DELIVERED'){if(req.user.role!=='DELIVERY_BOY')return res.status(403).json({error:'Only Delivery Boy can complete delivery'});if(String(req.body.deliveryOtp||'')!==String(o.deliveryOtp))return res.status(400).json({error:'Invalid delivery OTP'});o.deliveredAt=new Date();}
 o.status=nextStatus;await o.save();res.json({success:true,message:`Order ${nextStatus}`,order:await publicOrder(o)});
 }catch(e){next(e)}});

r.put('/:id/assign-delivery',auth,roles('ADMIN','VENDOR'),async(req,res,next)=>{try{
 const o=await Order.findById(req.params.id);if(!o)return res.status(404).json({error:'Order not found'});
 if(req.user.role==='VENDOR'&&o.vendorId!==req.user.vendorId)return res.status(403).json({error:'Not your order'});
 if(o.status!=='READY')return res.status(400).json({error:'Order must be READY before assigning delivery'});
 const d=await User.findOne({deliveryBoyId:req.body.deliveryBoyId,role:'DELIVERY_BOY',active:true});if(!d)return res.status(400).json({error:'Delivery Boy not found or inactive'});
 o.deliveryBoyId=d.deliveryBoyId;await o.save();res.json({success:true,message:'Delivery Boy assigned',order:await publicOrder(o)});
 }catch(e){next(e)}});

r.put('/:id/location',auth,roles('DELIVERY_BOY'),async(req,res,next)=>{try{
 const lat=Number(req.body.lat),lng=Number(req.body.lng),accuracy=Number(req.body.accuracy||0);if(!Number.isFinite(lat)||!Number.isFinite(lng))return res.status(400).json({error:'Valid lat/lng required'});
 const o=await Order.findOne({_id:req.params.id,deliveryBoyId:req.user.deliveryBoyId,status:'OUT_FOR_DELIVERY'});if(!o)return res.status(404).json({error:'Active delivery not found'});
 o.lastDeliveryLocation={lat,lng,accuracy,updatedAt:new Date()};await o.save();res.json({success:true,status:o.status,location:o.lastDeliveryLocation});
 }catch(e){next(e)}});

r.get('/:id',auth,async(req,res,next)=>{try{
 const o=await Order.findById(req.params.id);if(!o)return res.status(404).json({error:'Order not found'});
 const allowed=req.user.role==='ADMIN'||(req.user.role==='CUSTOMER'&&String(o.customerId)===String(req.user._id))||(req.user.role==='VENDOR'&&o.vendorId===req.user.vendorId)||(req.user.role==='DELIVERY_BOY'&&o.deliveryBoyId===req.user.deliveryBoyId);if(!allowed)return res.status(403).json({error:'Permission denied'});
 res.json({success:true,order:await publicOrder(o),timeline:['PENDING','ACCEPTED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED']});
 }catch(e){next(e)}});

module.exports=r;