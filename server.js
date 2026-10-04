require('dotenv').config();
const express=require('express'),cors=require('cors'),mongoose=require('mongoose'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),admin=require('firebase-admin');
const Service=require('./models/Service'),User=require('./models/User'),Vendor=require('./models/Vendor'),Product=require('./models/Product');
const app=express();app.disable('x-powered-by');app.use(cors({origin:process.env.CORS_ORIGIN||'*'}));app.use(express.json({limit:'6mb'}));
function initFirebase(){try{if(!process.env.FIREBASE_SERVICE_ACCOUNT)return null;if(admin.apps.length)return admin.app();return admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))})}catch(e){console.error('Firebase init failed:',e.message);return null}}
app.get('/',(q,s)=>s.json({name:'Amroha One API',version:'2.1.0',status:'ok'}));
app.get('/health',(q,s)=>s.json({status:'ok',appName:'Amroha One',database:mongoose.connection.readyState===1?'connected':'disconnected',fcm:Boolean(app.locals.firebaseAdmin),services:{tiffin:true,porter:false,cityServices:false,grocery:false}}));
app.use('/api/vendors',require('./routes/vendors'));app.use('/api/auth',require('./routes/auth'));app.use('/api/profile',require('./routes/profile'));app.use('/api/services',require('./routes/services'));app.use('/api/products',require('./routes/products'));app.use('/api/orders',require('./routes/orders'));app.use('/api/tracking',require('./routes/tracking'));app.use('/api/admin',require('./routes/admin'));app.use('/api/delivery',require('./routes/delivery'));
app.use((e,q,s,n)=>{console.error(e);if(e.code===11000)return s.status(409).json({error:'Duplicate record'});if(e.name==='ValidationError')return s.status(400).json({error:e.message});s.status(500).json({error:'Internal server error'})});

async function seedTiffinCatalog(){
  const vendors=await Vendor.find({approved:true,active:true,services:'TIFFIN'});
  const single=[
    ['Mini Veg Tiffin','Single Meal','3 Chapatis + 1 Veg Curry/Sabzi + Dal',50,'half / mini portion'],
    ['Mini Veg Tiffin','Single Meal','3 Chapatis + 1 Veg Curry/Sabzi + Dal',75,'full / standard portion'],
    ['Standard Veg Tiffin','Single Meal','4 Chapatis + Rice + 1 Sabzi + Dal + Salad',70,'half / mini portion'],
    ['Standard Veg Tiffin','Single Meal','4 Chapatis + Rice + 1 Sabzi + Dal + Salad',90,'full / standard portion'],
    ['Deluxe Veg Thali','Single Meal','4 Butter Rotis + Jeera Rice + Paneer Dish + Dal Makhani + Sweet/Raita',90,'half / mini portion'],
    ['Deluxe Veg Thali','Single Meal','4 Butter Rotis + Jeera Rice + Paneer Dish + Dal Makhani + Sweet/Raita',130,'full / standard portion'],
    ['Egg Tiffin','Single Meal','Egg Curry (2 eggs) + 4 Chapatis + Rice + Salad',80,'half / mini portion'],
    ['Egg Tiffin','Single Meal','Egg Curry (2 eggs) + 4 Chapatis + Rice + Salad',110,'full / standard portion'],
    ['Standard Non-Veg Tiffin','Single Meal','Chicken Curry + 4 Chapatis + Rice + Salad',100,'half / mini portion'],
    ['Standard Non-Veg Tiffin','Single Meal','Chicken Curry + 4 Chapatis + Rice + Salad',130,'full / standard portion'],
    ['Special Mutton Tiffin','Single Meal','Mutton Curry + 4 Chapatis + Steamed Rice + Salad',140,'half / mini portion'],
    ['Special Mutton Tiffin','Single Meal','Mutton Curry + 4 Chapatis + Steamed Rice + Salad',180,'full / standard portion']
  ];
  const plans=[
    ['Weekly Plan - 6 Days','Subscription','1 Meal/Day (Lunch OR Dinner) • Veg',420,'weekly • veg'],
    ['Weekly Plan - 6 Days','Subscription','1 Meal/Day (Lunch OR Dinner) • Non-Veg',660,'weekly • non-veg'],
    ['Weekly Plan - 6 Days','Subscription','2 Meals/Day (Lunch AND Dinner) • Veg',800,'weekly • veg'],
    ['Weekly Plan - 6 Days','Subscription','2 Meals/Day (Lunch AND Dinner) • Non-Veg',1250,'weekly • non-veg'],
    ['Monthly Plan - 26 Days','Subscription','1 Meal/Day (Lunch OR Dinner) • Veg',1800,'monthly • veg'],
    ['Monthly Plan - 26 Days','Subscription','1 Meal/Day (Lunch OR Dinner) • Non-Veg',2700,'monthly • non-veg'],
    ['Monthly Plan - 26 Days','Subscription','2 Meals/Day (Lunch AND Dinner) • Veg',3400,'monthly • veg'],
    ['Monthly Plan - 26 Days','Subscription','2 Meals/Day (Lunch AND Dinner) • Non-Veg',5000,'monthly • non-veg'],
    ['Student / Budget Monthly','Subscription','1 Meal/Day (Standard Mini Veg)',1500,'student monthly • veg']
  ];
  const extras=[
    ['Extra Chapati','Add-on','Per pc',8,'per piece'],
    ['Extra Bowl of Rice / Dal','Add-on','One extra bowl',30,'per bowl'],
    ['Plain Curd / Boondi Raita','Add-on','One serving',25,'per serving'],
    ['Sweet - Gulab Jamun / Kheer','Add-on','1 pc',25,'per piece'],
    ['Packing & Delivery Charges','Add-on','Monthly plan',0,'Included / Free']
  ];
  const all=[...single,...plans,...extras];
  for(const v of vendors)for(const [name,category,description,price,unit] of all)
    await Product.updateOne({vendorId:v.vendorId,name,price,category},
      {$set:{serviceKey:'TIFFIN',vendorId:v.vendorId,name,category,description,price,unit,stock:999,active:true}},
      {upsert:true});
  console.log('Tiffin catalog seeded for '+vendors.length+' vendor(s).');
}

async function seedDemoAccounts(){
  const demoPassword=process.env.DEMO_PASSWORD;
  if(!demoPassword){console.log('Demo accounts skipped: set DEMO_PASSWORD to enable test accounts.');return;}
  const passwordHash=await bcrypt.hash(demoPassword,12);
  const demo=[
    {name:'Demo Admin',phone:process.env.DEMO_ADMIN_PHONE||'9999900001',email:'admin.demo@amroha.one',role:'ADMIN'},
    {name:'Demo Vendor',phone:process.env.DEMO_VENDOR_PHONE||'9999900002',email:'vendor.demo@amroha.one',role:'VENDOR'},
    {name:'Demo Customer',phone:process.env.DEMO_CUSTOMER_PHONE||'9999900003',email:'customer.demo@amroha.one',role:'CUSTOMER'},
    {name:'Demo Delivery Boy',phone:process.env.DEMO_DELIVERY_PHONE||'9999900004',email:'delivery.demo@amroha.one',role:'DELIVERY_BOY'}
  ];
  const users={};
  for(const d of demo){
    let u=await User.findOne({phone:d.phone});
    if(!u)u=await User.create({...d,passwordHash,active:true,address:{}});
    users[d.role]=u;
  }
  let vendor=await Vendor.findOne({userId:users.VENDOR._id});
  if(!vendor)vendor=await Vendor.create({vendorId:'VDEMO001',userId:users.VENDOR._id,businessName:'Amroha Tiffin Demo',services:['TIFFIN'],approved:true,active:true,address:{city:'Amroha'}});
  if(users.VENDOR.vendorId!==vendor.vendorId){users.VENDOR.vendorId=vendor.vendorId;await users.VENDOR.save();}
  if(!users.DELIVERY_BOY.deliveryBoyId){users.DELIVERY_BOY.deliveryBoyId='DDEMO001';await users.DELIVERY_BOY.save();}
  const sample=[['Demo Veg Tiffin','Complete veg tiffin',120],['Demo Special Tiffin','Special meal demo',180],['Demo Roti','Fresh roti',10]];
  for(const [name,description,price] of sample)await Product.updateOne({vendorId:vendor.vendorId,name},{$setOnInsert:{serviceKey:'TIFFIN',vendorId:vendor.vendorId,name,description,price,unit:'plate',stock:100,active:true}},{upsert:true});
  console.log('Demo accounts seeded.');
}

async function start(){
  if(!process.env.MONGODB_URI||!process.env.JWT_SECRET)throw new Error('MONGODB_URI and JWT_SECRET are required');
  await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
  const defs=[['TIFFIN','Amroha Tiffin',true,1],['PORTER','Amroha Porter',false,2],['CITY_SERVICES','Amroha City Services',false,3],['GROCERY','Amroha Grocery',false,4]];
  for(const [key,name,active,sortOrder] of defs)await Service.updateOne({key},{$setOnInsert:{key,name,active,sortOrder,description:name+' service'}},{upsert:true});
  if(process.env.ADMIN_PHONE&&process.env.ADMIN_PASSWORD&&!await User.exists({phone:process.env.ADMIN_PHONE})){
    const u=await User.create({name:process.env.ADMIN_NAME||'Amroha One Admin',phone:process.env.ADMIN_PHONE,email:'',passwordHash:await bcrypt.hash(process.env.ADMIN_PASSWORD,12),role:'ADMIN'});
    console.log('Admin seeded:',u.phone);
  }
  await seedDemoAccounts();
  await seedTiffinCatalog();
  app.locals.firebaseAdmin=initFirebase();
  const port=Number(process.env.PORT||10000);app.listen(port,'0.0.0.0',()=>console.log('Amroha One API 2.1.0 listening on '+port));
}
start().catch(e=>{console.error('Startup failed:',e.message);process.exit(1)});