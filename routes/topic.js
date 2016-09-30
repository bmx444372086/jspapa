var config = require('../config');
var express = require('express');
var bodyParser = require('body-parser');
var markdown = require('markdown').markdown;

var M = require('../models');

var router = express.Router();

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));

//topic首页跳到主页
router.get('/', function(req, res, next) {
  res.redirect(301, "/");
});


//显示主题详情
router.get('/show/:id', function(req, res, next) {
  var id = req.params.id;
  var data = {};

  M.Topic.findOne({"_id": id}).exec()
  .then(function(topicDoc){
    topicDoc.content = markdown.toHTML(topicDoc.content);
    return data.topic = topicDoc;
  })
  .then(function(topicDoc){
    return M.User.findOne({"_id": topicDoc.user._id}).exec();
  })
  .then(function(authorDoc){
    data.author = authorDoc;
    return authorDoc.topics;
  })
  .then(function(authorTopicsIds){
    return M.Topic.find({"_id": {"$in": authorTopicsIds}}, null, {'sort': {"created": -1}}).exec();
  })
  .then(function(authorTopics){
    data.authorTopics = authorTopics;
  })
  .then(function(){
    return M.Comment.find({"topicId": id}).exec();
  })
  .then(function(topicComments){
    var l = topicComments.length;
    for(var i = 0; i < l; i++){
      topicComments[i]["content"] = markdown.toHTML(topicComments[i]["content"]);
    }
    data.comment = topicComments;
  })
  .then(function(){
    data.cate = {"id": data.topic.cate, "name": config.cates[data.topic.cate]};
    res.render('topic', data);
  });

  //浏览主题计数器
  M.Topic.updateVeiwsById(id);

});


//添加评论
router.post('/show/:id', function(req, res, next) {
  var tid = req.params.id;

  if(!req.session.user){
    req.session.lastpage = "/topic/show/"+tid+"#reply";
    res.redirect("/login");
    return false;
  }

  req.body.user = {
    "_id": req.session.user._id,
    "name": req.session.user.name
  }
  req.body.topicId = tid;

  var setUserReplies = function(){
    //最近评论过的10个主题，去重，保持10个
    var tidIdx = req.session.user.replies.indexOf(tid);
    if(tidIdx > -1){
      req.session.user.replies.splice(tidIdx,1);
    }
    req.session.user.replies.push(tid);
    if(req.session.user.replies.length > 10){
      req.session.user.replies.shift(0);
    }
    return req.session.user.replies;
  }


  M.Comment.create(req.body)

  .then(function(commentDoc){
    return commentDoc;
  })
  .then(function(commentDoc){
    var userReplies = setUserReplies();
    M.User.update({"_id": req.body.user._id}, {"$set": {"replies": userReplies}}).exec();
    return commentDoc;
  })
  .then(function(commentDoc){
    //此主题回帖数计数
    M.Topic.updateCommentsById(tid);

    //总回帖数计数
    M.Site.updateCommets();

    res.redirect('/topic/show/'+tid+'#'+commentDoc._id);
  });

});


//新增主题页面
router.get('/create', function(req, res, next) {

  if(!req.session.user){
    req.session.lastpage = "/topic/create";
    res.redirect("/login");
    return false;
  }

  res.render('topic-create', {"topic": {}, "isCreate": true});
});

//保存新主题
router.post('/create', function(req, res) {

  if(!req.session.user){
    res.redirect("/login");
    return false;
  }else if(!req.body.cate || !req.body.title || !req.body.content){
    res.render('topic-create', {"msg": "板块、标题、内容不能为空"});
    return false;
  }

  req.body.user = {
    "_id": req.session.user._id,
    "name": req.session.user.name
  }

  var addNewTopic = M.Topic.create(req.body);

  addNewTopic
  .then(function(topicDoc){
    return topicDoc;
  })
  .then(function(topicDoc){
    var updateUserTopics = M.User.update({"_id": req.body.user._id}, {"$push": {"topics": {"$each": [topicDoc._id], "$slice": -10}}}).exec();
    
    updateUserTopics
    .then(function(){
      req.session.user.topics.push(topicDoc._id);
      res.redirect('/topic/show/'+topicDoc._id);

      //发帖数计数器
      M.Site.updateTopics();
      
    });
  });

});


//删除主题
router.get('/del/:id', function(req, res, next) {
  var tid = req.params.id;

  if(req.session.user.name !== "admin"){
    res.redirect("/login");
    return false;
  }


  M.Topic.remove({"_id": tid}, function(err, result){
    if(err){
      console.log(err);
    }else{
      res.redirect("/");
    }
  });

  
});


//good:精华、top:置顶
router.get('/type/:id/:type', function(req, res, next) {
  var tid = req.params.id;
  var type = req.params.type;

  if(req.session.user.name !== "admin"){
    res.redirect("/login");
    return false;
  }

  M.Topic.update({"_id": tid}, {"$set": {"type": type}}, function(err, result){
    if(err){
      console.log(err);
    }else{
      res.redirect("/");
    }
  });

  
});

//编辑主题
router.get('/edit/:id', function(req, res, next) {
  var tid = req.params.id;

  if(!req.session.user){
    res.redirect("/login");
    return false;
  }

  M.Topic.findOne({"_id": tid}, function(err, doc){
    if(err){
      res.render("error", {"msg": "不存在此主题！"});
      return false;
    }else{
      if(req.session.user._id !== doc.user._id.toString()){
        res.redirect("/login");
        return false;
      }
      res.render("topic-create", {"topic": doc, "isCreate": false});
    }
  });
  
});


//保存编辑的主题
router.post('/edit/:id', function(req, res, next) {
  var tid = req.params.id;

  if(!req.session.user){
    res.redirect("/login");
    return false;
  }


  var findTopic = M.Topic.findOne({"_id": tid}).exec();

  findTopic
  .then(function(topicDoc){

    if(req.session.user._id !== topicDoc.user._id.toString()){
      res.redirect("/login");
      return false;
    }

    return topicDoc;
  })
  .then(function(topicDoc){

    topicDoc.title = req.body.title;
    topicDoc.content = req.body.content;
    topicDoc.cate = req.body.cate;

    topicDoc.save(function(err, doc){
      if(err){
        res.render("error", {"msg": "保存出现错误！"});
      }else{
        res.redirect('/topic/show/'+tid);
      }
    });
  });

});

module.exports = router;
