Players = new Meteor.Collection("player");
Moves = new Meteor.Collection("moves");

if (Meteor.isServer) {
  Meteor.publish('players', function (room_id) {
    return Players.find({room: room_id}, {fields: {last_keepalive: 0, auth_tok: 0, move: 0}});
  });
  Meteor.publish('players-self', function () {
    return Players.find({auth_tok: this.userId}, {fields: {last_keepalive: 0}});
  });
  Meteor.publish('moves', function (room_id) {
    return Moves.find({room: room_id});
  });


  // Security
  // The client can only interact using the methods defined below, and by deleting or
  // changing a client where he knows the auth_tok for. The auth_tok is only shown to
  // clients who knew it before.
  Players.allow({
    remove: function (userId, player) {
      return userId == player.auth_tok;
    },
    update: function (userId, player, fields, mod) {
      return userId == player.auth_tok;
    }
  });
  Moves.deny({
    insert: function (userId, doc) {
      if (doc.msg == "I want to play!")
	Meteor.call('letsplay', doc.room);
      roll = handleDiceCmd(doc.msg)
      if (roll)
	 Moves.insert({msg: roll, timestamp: doc.timestamp+1, room:doc.room, name: "Dice Cup"});
      return false;
    }
  });
  Moves.allow({
    insert: function (userId, doc) {
      if (!doc.room)
	  return false;
      // Check if logged in
      var p = Players.findOne({room: doc.room, auth_tok: userId});
      if (!p)
	  return false;
      if (p.name != doc.name)
	  return false;
      if (!doc.timestamp)
	  return false;
      if (Math.abs(doc.timestamp - (new Date()).getTime()) > 2*1000)
	  return false;
      if (!doc.msg)
	  return false;
      if (doc.entries)
	  return false;
      return true;
    }
  })

  // Database setup
  Meteor.startup(function () {
    Players._ensureIndex({room: 1});
    Players._ensureIndex({auth_tok: 1});
    Moves._ensureIndex({room: 1});
  });


  Meteor.methods({
    keepalive: function (player_id) {
      Players.update({_id: player_id},
		    {$set: {last_keepalive: (new Date()).getTime(),
			    idle: false}});
    },

    join: function (name, room_id) {
      var auth_tok = this.userId;
      Players.remove({room: room_id, auth_tok: auth_tok});
      var player_id = Players.insert(
	{room: room_id, name: name, idle: false, isfinal: false, auth_tok: auth_tok}
	);
      Meteor.call('keepalive', player_id);
      var p= Players.findOne(player_id);
      return p;
    },

    login: function (auth_tok) {
      if (!auth_tok) {
	var auth_tok = Random.id();
      }
      this.setUserId(auth_tok);
      return auth_tok;
    },

    checkMove: function () {
      // Can this be done better?
      var rooms = {}
      Players.find({idle:false}).forEach(function (player) {
	rooms[player.room] = 1;
      })

      for (var room_id in rooms) {
	//console.log("Checking if move is done in room", room_id);
	var unfinished_players = Players.find({idle: false, isfinal: false, room: room_id});
	if (unfinished_players.count() > 0) {
	  // console.log("Found unfinished players in room", room_id);
	  continue;
	}
	var active_players = Players.find({idle: false, isfinal: true, room: room_id}, {sort: {name: 1}});
	if (active_players.count() == 0) {
	  // console.log("No finished players.");
	  continue;
	}
	var move = [];
	active_players.forEach(function (player) {
	  move.push({name: player.name, move: player.move});
	  Players.update(player._id, {$set : {move : "", isfinal: false} });
	});
    	var now = (new Date()).getTime();
	var num = Moves.find({room:room_id, entries: {$exists: true}}).count();
	Moves.insert({entries:move, timestamp: now, room: room_id, count: num+1});
	// console.log("Got a finished move:", move);
      }
    },

    // An attempt to write a Rock-Paper-Scissors bot, but not fully functional
    letsplay: function (room_id) {
      var auth_tok = this.userId;
      players = Players.find({idle:false, room:room_id, auth_tok:auth_tok});
      if (players.count() == 0) {
        console.log('letsplay: player not here');
	return;
      }
      var name = "Karlchen";
      if (Players.find({room: room_id, name: name, idle:false}).count() > 0) {
        console.log('letsplay: another bot already here');
	return;
      }
      var now = (new Date()).getTime();
      var player_id = Players.insert(
	{room: room_id, name: name, idle: false, last_keepalive: now, isfinal: false}
	);
      Meteor.setTimeout(function (){
	var now = (new Date()).getTime();
	Moves.insert({msg: "Hi there!", timestamp: now, room:room_id, name: name});
	Meteor.setTimeout(function (){
	  var now = (new Date()).getTime();
	  Moves.insert({msg: "Hmm... Rock, Paper or Scissors?..", timestamp: now, room:room_id, name: name});
	  }, 2*1000);
	var wait;
	var wait2;
	var repeat;
	repeat = Meteor.setInterval(function (){
	  player = Players.findOne(player_id);
	  if (!player)  {
	      if (wait) Meteor.clearTimeout(wait);
	      if (wait2) Meteor.clearTimeout(wait2);
	      Meteor.clearInterval(repeat);
	  }
	  if (!player.isfinal) {
	    var now = (new Date()).getTime();
	    var moves = ["Rock", "Paper", "Scissors"];
	    var move = moves[Math.floor(Math.random()*moves.length)];

	    var other_players = Players.find({room: room_id, idle: false});
	    if (other_players.count() <= 1) {
	      Players.remove(player_id);
	      Meteor.clearInterval(repeat);
	      if (wait) Meteor.clearTimeout(wait);
	      if (wait2) Meteor.clearTimeout(wait2);
	    } else {
	      Players.update(player_id, {$set: {last_keepalive: now, move: move, isfinal: true}});

	      if (wait) Meteor.clearTimeout(wait);
	      if (wait2) Meteor.clearTimeout(wait2);
	      wait2 = Meteor.setTimeout(function (){
		player = Players.findOne(player_id);
		if (player && player.isfinal) {
		  var now = (new Date()).getTime();
		  Moves.insert({msg: "I am done...", timestamp: now, room:room_id, name: name});
		}
	      }, 4*1000);
	      wait = Meteor.setTimeout(function (){
		var now = (new Date()).getTime();
		Moves.insert({msg: "Playing with humans is boring, good bye...", timestamp: now, room:room_id, name: name});
		Players.remove(player_id);
		Meteor.clearInterval(repeat);
		if (wait) Meteor.clearTimeout(wait);
		if (wait2) Meteor.clearTimeout(wait2);
	      }, 30*1000);
	    }
	  }
	}, 5*1000);
      }, 1000);
    }
  });

  Meteor.setInterval(function () {
    var now = (new Date()).getTime();
    var idle_threshold = now - 70*1000; // 70 sec
    var remove_threshold = now - 60*60*1000; // 1hr, TODO

    Players.update({last_keepalive: {$lt: idle_threshold}},
		   {$set: {idle: true}},
		   {multi: true});

  }, 30*1000);

  Meteor.startup(function() {
    Players.find().observe(
      {changed: function () {Meteor.call('checkMove')}, 
       added: function () {Meteor.call('checkMove')}, 
       removed: function () {Meteor.call('checkMove')}, 
      });
  });
}


///
/// Client
///

if (Meteor.isClient) {
  // Routes
  var YouSayFirstRouter = Backbone.Router.extend({
    routes: {
      ":room": "main",
      "": "welcome",
    },
    welcome: function () {
      Session.set("room_id", false);
    },
    main: function (room_id) {
      var oldRoom = Session.get("room_id");
      if (oldRoom !== room_id) {
	Session.set("room_id", room_id);
      }
    },
    setRoom: function (room_id) {
      this.navigate(room_id, true);
    }
  });

  Router = new YouSayFirstRouter;

  Meteor.startup(function () {
    Backbone.history.start({pushState: true});
  });

  // Auth token handling

  Meteor.startup(function () {
    Session.set('auth_tok', false);
    var auth_id = window.sessionStorage.getItem('you-say-first-id');
    Meteor.call('login', auth_id, function (error, auth_tok) {
      window.sessionStorage.setItem('you-say-first-id', auth_tok);
      Session.set('auth_tok', auth_tok);
    })
  });
 
  Deps.autorun(function(){
    // New room: Check if we are playing here at the moment, and load the values
    auth_tok = Session.get('auth_tok');
    if (auth_tok) {
      var room_id = Session.get('room_id');
      Router.setRoom(room_id);
      Session.set('player_id', null);
      Meteor.subscribe('players-self', {
	onReady: function (){
	  /* Try to load an existing player */
	  p = Players.findOne({auth_tok: Session.get('auth_tok'), room: room_id});
	  if (p) {
	    Session.set('player_id', p._id);
	    // Load previous values
	    $('input#myname').val(p.name);
	    $('input#mymove').val(p.move);
	    $('input#myfinal').prop('checked', p.isfinal);
	  }
	}
      });
      Meteor.subscribe('players', room_id);
      Meteor.subscribe('moves', room_id);
    }
  });

  Meteor.startup(function () {
    Meteor.setInterval(function() {
      if (Meteor.status().connected)
	Meteor.call('keepalive', Session.get('player_id'));
      }, 20*1000);
  })

  var player = function () {
    return Players.findOne({_id: Session.get('player_id'), room: Session.get('room_id')});
  };

  Deps.autorun(function (){
    var me = player();
    if (me) {
      // Load values
      $('input#myname').val(me.name);
      // Only set move when myfinal is checked, e.g. when the
      // user has submitted a move and the next turn begins
      if ($('input#myfinal').prop('checked')) {
	      $('input#mymove').val(me.move);
	      $('input#myfinal').prop('checked', me.isfinal);
      }

      // activate fields for logged-in users
      $('input#myname').prop('disabled', true);
      $('input#join').prop('disabled', true);
      $('input#leave').prop('disabled', false);
      $('input#mymove').prop('disabled', me.isfinal);
      $('input#myfinal').prop('disabled', false);
      $('input#chat').prop('disabled', false);
      $('input#send').prop('disabled', false);
    } else {
      // disable fields for logged-in users
      $('input#myname').prop('disabled', false);
      $('input#join').prop('disabled', false);
      $('input#leave').prop('disabled', true);
      $('input#mymove').prop('disabled', true);
      $('input#myfinal').prop('disabled', true);
      $('input#chat').prop('disabled', true);
      $('input#send').prop('disabled', true);
    };
  })


  Template.page.room = function () {
    return Session.get('room_id');
  }

  Template.room.loggedin = function () {
    return Boolean(Session.get('player_id'));
  };

  Template.moves.moves = function () {
    return Moves.find({}, {sort: {timestamp: 1}});
  };
  Template.moves.helpers({
    timeago_stamp: function (timestamp) {
    	return new Date(timestamp).toISOString();
    },
    format_time: function (timestamp) {
    	return new Date(timestamp).toString();
    },
    });
  Template.moves.rendered = function (inst) {
    if (!Session.get('moves_scrolled')){
      $("#moves_pane .overflow").scrollTop($("#moves_pane .overflow")[0].scrollHeight - $("#moves_pane .overflow").height());
      $("span.date").timeago();
    }
  };
  Template.room.events({
    'scroll #moves_pane .overflow': function (evt) {
      Session.set('moves_scrolled', $("#moves_pane .overflow").scrollTop() != $("#moves_pane .overflow")[0].scrollHeight - $("#moves_pane .overflow").height());
    },
  });

  Template.explanation.events({
    'click #letsplay': function (evt) {
      var room_id = Session.get('room_id');
      if (room_id) {
	var me = player();
    	var now = (new Date()).getTime();
	Moves.insert({msg:'I want to play!', name:me.name, timestamp: now, room: room_id});
      }
      return false;
    },
    'click .saythis': function (evt) {
      var room_id = Session.get('room_id');
      if (room_id) {
	var me = player();
    	var now = (new Date()).getTime();
	Moves.insert({msg:evt.currentTarget.text, name:me.name, timestamp: now, room: room_id});
      }
      return false;
    },
  });

  Template.players.players = function () {
    return Players.find({room: Session.get('room_id')}, {sort: {'name':1}});
  };

  Template.welcome.roomname = function () {
    return adjectives[Math.floor(Math.random()*adjectives.length)]+'-'+
           nouns[Math.floor(Math.random()*nouns.length)]+'-'+
    	   'room';
  };

  Template.welcome.events({
    'keypress input#room': function (evt) {
      if (evt.which==13) {
      	$('input#roomsubmit').click();
      } 
    },
    'click input#roomsubmit': function (evt) {
      var roomname = $('input#room').val().trim();
      if (roomname) {
	Session.set('room_id', roomname);
      }
    }
  });


  function submitMove () {
    var isfinal = Boolean($('input#myfinal').prop('checked'));
    var move = $('input#mymove').val().trim();
    Players.update(Session.get('player_id'), {$set: {move: move, isfinal: isfinal}});
  }

  Template.room.events({
    'keyup input#myname': function (evt) {
      var name = $('input#myname').val().trim();
      $('input#join').prop('disabled', !name);
    },
    'keypress input#myname': function (evt) {
      if (evt.which==13) {
      	$('input#join').click();
      } 
    },
    'click input#join': function (evt) {
      var name = $('input#myname').val().trim();
      var p = Meteor.call('join', name, Session.get('room_id'), function (error, p) {
	Session.set('player_id', p._id);
      });
    },
    'click input#leave': function (evt) {
      var me = player();
      Players.remove(me._id);
      Session.set('player_id', false);
    },
    'keypress input#mymove': function (evt) {
      if (evt.which==13) {
      	$('input#myfinal').prop('checked', ! $('input#myfinal').prop('checked'));
	submitMove();
      } 
    },
    'change input#myfinal': function (evt) {
      submitMove();
    },
    'keyup input#chat': function (evt) {
      var msg = $('input#chat').val().trim();
      $('input#send').prop('disabled', !msg);
    },
    'keypress input#chat': function (evt) {
      if (evt.which==13) {
      	$('input#send').click();
      } 
    },
    'click input#send': function (evt) {
      var msg = $('input#chat').val().trim();
      if (msg) {
	var room_id = Session.get('room_id');
	var me = player();
    	var now = (new Date()).getTime();
	Moves.insert({msg:msg, name:me.name, timestamp: now, room: room_id});
	$('input#chat').val('');
      }
    }
  });

}

