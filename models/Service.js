const mongoose=require('mongoose');
module.exports=mongoose.model('Service',new mongoose.Schema({key:{type:String,unique:true},name:String,active:Boolean,sortOrder:Number,description:String},{timestamps:true}));
