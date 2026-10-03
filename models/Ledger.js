const mongoose=require('mongoose');
module.exports=mongoose.model('Ledger',new mongoose.Schema({userId:mongoose.Schema.Types.ObjectId,orderId:mongoose.Schema.Types.ObjectId,type:String,amount:Number,description:String,balanceAfter:Number},{timestamps:true}));
