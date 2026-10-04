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
const distanceKm=(lat1,lng1,lat2,lng2)=>{const R=6371,la1=Number(lat1)*Math.PI/180,la2=Number(lat2)*Math.PI/180,dla=(Number(lat2)-Number(lat1))*Math.PI/180,dlo=(Number(lng2)-Number(lng1))*Math.PI/180;const a=Math.sin(dla/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dlo/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));};
const checkVendorService=(v,address)=>{if(v.acceptingOrders===false)throw Object.assign(new Error('Vendor is currently offline for new orders'),{statusCode:409});const vlat=Number(v.address?.lat),vlng=Number(v.address?.lng),clat=Number(address?.lat),clng=Number(address?.lng),radius=Number(v.serviceRadiusKm||10);if(!Number.isFinite(vlat)||!Number.isFinite(vlng)||vlat===0||vlng===0)throw Object.assign(new Error('Vendor service center is not configured'),{statusCode:409});if(!Number.isFinite(clat)||!Number.isFinite(clng)||clat===0||clng===0)throw Object.assign(new Error('Customer delivery location is required'),{statusCode:400});const km=distanceKm(vlat,vlng,clat,clng);if(km>radius)throw Object.assign(new Error(`Customer is ${km.toFixed(1)} km away; vendor serves up to ${radius} km`),{statusCode:422});return km;};

const legacyKeyOk=req=>Boolean((req.get('X-API-Key')||'').trim());
const legacyCustomer=async body=>{
  const name=String(body?.customer?.name||'Customer').trim()||'Customer';
  const phone=String(body?.customer?.phone||'').trim();
  if(!/^[0-9]{10}$/.test(phone))throw Object.assign(new Error('Valid 10-digit customer phone is required'),{statusCode:400});
  let u=await User.findOne({phone});
  if(!u){u=await User.create({name,phone,passwordHash:'legacy-api-user',role:'CUSTOMER',active:true,address:body.deliveryAddress||{}});}
  else {if(name)u.name=name;if(body.deliveryAddress)u.address=body.deliveryAddress;await u.save();}
  return u;
};
const legacyVendor=async requested=>{
  if(requested){const v=await Vendor.findOne({vendorId:requested,approved:true,active:true});if(v)return v;}
  return Vendor.findOne({approved:true,active:true,services:'TIFFIN'}).sort({createdAt:1});
};

// Compatibility API for the existing Amroha One Android APK.
// It keeps the current JWT API untouched while accepting the APK's X-API-Key contract.
r.post('/create',async(req,res,next)=>{if(!legacyKeyOk(req))return res.status(401).json({error:'Invalid API key'});try{
  const b=req.body||{},u=await legacyCustomer(b),v=await legacyVendor(String(b.vendorId||''));
  if(!v)return res.status(400).json({error:'No approved active TIFFIN vendor available'});
  checkVendorService(v,b.deliveryAddress);
  const raw=Array.isArray(b.items)?b.items:[];if(!raw.length)return res.status(400).json({error:'items are required'});
  const finalItems=raw.map(x=>({name:String(x.name||'Veg Lunch'),qty:Math.max(1,Number(x.quantity||x.qty||1)),unitPrice:Number(x.price||x.unitPrice||0),options:x.options||{}}));
  const subtotal=Number(b.totalPrice||finalItems.reduce((n,x)=>n+(x.unitPrice*x.qty),0));
  const o=await Order.create({orderNo:no(),customerId:u._id,vendorId:v.vendorId,serviceKey:'TIFFIN',items:finalItems,deliveryAddress:b.deliveryAddress||u.address||{},subtotal,grandTotal:subtotal,paymentType:['COD','UPI'].includes(String(b.paymentType||'COD').toUpperCase())?String(b.paymentType||'COD').toUpperCase():'COD',paymentStatus:'PENDING',status:'PENDING',deliveryOtp:otp()});
  res.status(201).json({success:true,message:'Order created',order:await publicOrder(o)});
}catch(e){next(e)}});

r.get('/delivery',async(req,res,next)=>{if(!legacyKeyOk(req))return res.status(401).json({error:'Invalid API key'});try{
  const os=await Order.find({status:'OUT_FOR_DELIVERY',deliveryBoyId:{$exists:true,$ne:null}}).sort({createdAt:-1});
  const orders=await Promise.all(os.map(async o=>{const x=await publicOrder(o);const u=await User.findById(o.customerId).select('name phone');return {...x,totalPrice:x.grandTotal,customer:u?{name:u.name,phone:u.phone}:null};}));
  res.json({success:true,orders});
}catch(e){next(e)}});

r.get('/customer',async(req,res,next)=>{if(!legacyKeyOk(req))return res.status(401).json({error:'Invalid API key'});try{
  const u=await User.findOne({phone:String(req.query.phone||'')});if(!u)return res.json({success:true,orders:[]});
  const os=await Order.find({customerId:u._id}).sort({createdAt:-1});const orders=await Promise.all(os.map(async o=>{const x=await publicOrder(o);return {...x,totalPrice:x.grandTotal};}));
  res.json({success:true,orders});
}catch(e){next(e)}});

r.get('/incoming',async(req,res,next)=>{if(!legacyKeyOk(req))return res.status(401).json({error:'Invalid API key'});try{
  const vid=String(req.query.vendorId||'');const q=vid&&vid!=='V1'?{vendorId:vid}:{};
  const os=await Order.find(q).sort({createdAt:-1});
  const orders=await Promise.all(os.map(async o=>{const x=await publicOrder(o);const u=await User.findById(o.customerId).select('name phone');return {...x,totalPrice:x.grandTotal,customer:u?{name:u.name,phone:u.phone}:null};}));
  res.json({success:true,orders});
}catch(e){next(e)}});

r.put('/:id/status',async(req,res,next)=>{if(!req.get('X-API-Key'))return next();if(!legacyKeyOk(req))return res.status(401).json({error:'Invalid API key'});try{
  const o=await Order.findById(req.params.id);if(!o)return res.status(404).json({error:'Order not found'});
  const st=String(req.body?.status||'').toUpperCase();const caller=String(req.get('X-Role')||'').toUpperCase();const allowed=['PENDING','ACCEPTED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'];
  if(st==='OUT_FOR_DELIVERY'&&!['VENDOR','ADMIN'].includes(caller))return res.status(403).json({error:'Only Vendor or Admin can send order for delivery'});
  if(st==='DELIVERED'&&caller!=='DELIVERY')return res.status(403).json({error:'Only Delivery Boy can deliver the order'});
  if(!allowed.includes(st))return res.status(400).json({error:'Invalid order status'});
  if(st==='DELIVERED' && o.status!=='OUT_FOR_DELIVERY')return res.status(400).json({error:'Order must be OUT_FOR_DELIVERY before delivery'});if(st==='DELIVERED'){if(String(req.body?.deliveryOtp||'')!==String(o.deliveryOtp))return res.status(400).json({error:'Invalid delivery OTP'});o.deliveredAt=new Date();}o.status=st;if(st==='OUT_FOR_DELIVERY'){
    const d=await User.findOne({role:'DELIVERY_BOY',active:true,deliveryBoyId:{$exists:true,$ne:''}}).sort({createdAt:1});
    if(!d)return res.status(400).json({error:'No active Delivery Boy available'});
    o.deliveryBoyId=d.deliveryBoyId;
  }
  await o.save();
  res.json({success:true,message:'Order '+st,order:await publicOrder(o)});
}catch(e){next(e)}});

const publicOrder=async o=>{const v=await Vendor.findOne({vendorId:o.vendorId}).select('businessName vendorId');let deliveryBoy=null;if(o.deliveryBoyId){const d=await User.findOne({deliveryBoyId:o.deliveryBoyId,role:'DELIVERY_BOY'}).select('name phone deliveryBoyId');if(d)deliveryBoy={id:d.deliveryBoyId,name:d.name,phone:d.phone};}return {...o.toObject(),vendorName:v?.businessName||o.vendorId,assignedDeliveryBoy:deliveryBoy,assignmentStatus:o.deliveryBoyId?'ASSIGNED':'UNASSIGNED'};};

r.post('/',auth,roles('CUSTOMER'),async(req,res,next)=>{try{
 const body=req.body||{},rawVendorId=String(body.vendorId||'').trim(),serviceKey=String(body.serviceKey||'TIFFIN').toUpperCase(),items=Array.isArray(body.items)?body.items:[],deliveryAddress=body.deliveryAddress||{},paymentType=String(body.paymentType||'COD').toUpperCase();
 // Keep the authenticated APK order API compatible with older customer builds.
 const vendorId=(rawVendorId&&rawVendorId!=='V1')?rawVendorId:'';
 if(!items.length)return res.status(400).json({error:'At least one order item is required'});
 if(!Number.isFinite(Number(deliveryAddress.lat))||!Number.isFinite(Number(deliveryAddress.lng)))return res.status(400).json({error:'Current delivery location (lat/lng) is required'});
 if(!['COD','UPI'].includes(paymentType))return res.status(400).json({error:'Invalid payment type. Use COD or UPI'});
 let v=vendorId?await Vendor.findOne({vendorId,approved:true,active:true}):null;
 if(!v)v=await Vendor.findOne({approved:true,active:true,services:serviceKey}).sort({createdAt:1});
 if(!v)return res.status(400).json({error:'No approved active vendor is available for '+serviceKey});
 checkVendorService(v,deliveryAddress);
 const ids=items.map(x=>String(x.productId||x._id||x.id||'')).filter(Boolean);
 let ps=ids.length?await Product.find({_id:{$in:ids},vendorId:v.vendorId,serviceKey,active:true}):[];
 // If an older APK sends a product reference in a different field, fall back to name.
 if(ps.length!==items.length){
   const names=items.map(x=>String(x.name||'').trim()).filter(Boolean);
   if(names.length===items.length)ps=await Product.find({name:{$in:names},vendorId:v.vendorId,serviceKey,active:true});
 }
 if(ps.length!==items.length)return res.status(400).json({error:'One or more selected products are no longer available. Please reopen the vendor menu and select the item again.'});
 let subtotal=0;const finalItems=[];const stockChanges=[];
 for(const x of items){
   const ref=String(x.productId||x._id||x.id||'');
   const name=String(x.name||'').trim();
   const p=ps.find(z=>(ref&&String(z._id)===ref)||(!ref&&name&&z.name===name));
   if(!p)return res.status(400).json({error:'Selected product could not be matched'});
   const qty=Number(x.qty||x.quantity||1);
   if(!Number.isInteger(qty)||qty<1)return res.status(400).json({error:'Invalid quantity for '+p.name});
   if(p.stock<qty)return res.status(400).json({error:`Insufficient stock for ${p.name}`});
   subtotal+=p.price*qty;finalItems.push({productId:p._id,name:p.name,qty,unitPrice:p.price,options:x.options||{}});stockChanges.push({p,qty});
 }
 // Create the order first; only reduce stock after the order is successfully written.
 const o=await Order.create({orderNo:no(),customerId:req.user._id,vendorId:v.vendorId,serviceKey,items:finalItems,deliveryAddress,subtotal,grandTotal:subtotal,paymentType,paymentStatus:'PENDING',status:'PENDING',deliveryOtp:otp()});
 for(const x of stockChanges){x.p.stock-=x.qty;await x.p.save();}
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
 if(!['READY'].includes(o.status))return res.status(400).json({error:'Order must be READY before assigning delivery'});
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