Rooms = new Meteor.Collection("rooms");
Players = new Meteor.Collection("player");
Moves = new Meteor.Collection("moves");

if (Meteor.isServer) {
  Meteor.publish('players', function (room_id) {
    return Players.find({room: room_id}, {fields: {auth_tok: 0, move: 0}});
  });
  Meteor.publish('players-self', function () {
    return Players.find({auth_tok: this.userId});
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

    sendChat: function (room_id, msg) {
      // Has the player joined? What is his name?
      // Is this user allowed to use the name
      var p = Players.findOne({room: room_id, auth_tok: this.userId});
      if (p) {
    	var now = (new Date()).getTime();
	Moves.insert({msg:msg, name:p.name, timestamp: now, room: room_id});
      }
    },

    checkMove: function () {
      // Can this be done better?
      rooms = {}
      Players.find({idle:false}).forEach(function (player) {
	rooms[player.room] = 1;
      })

      for (var room_id in rooms) {
	//console.log("Checking if move is done...");
	unfinished_playsers = Players.find({idle: false, isfinal: false, room: room_id});
	if (unfinished_playsers.count() > 0) {
	  //console.log("Found unfinished players.");
	  return;
	}
	active_players = Players.find({idle: false, isfinal: true, room: room_id}, {sort: {name: 1}});
	if (active_players.count() == 0) {
	  //console.log("No finished players.");
	  return;
	}
	var move = [];
	active_players.forEach(function (player) {
	  move.push({name: player.name, move: player.move});
	  Players.update(player._id, {$set : {move : "", isfinal: false} });
	});
    	var now = (new Date()).getTime();
	var num = Moves.find({room:room_id, entries: {$exists: true}}).count();
	Moves.insert({entries:move, timestamp: now, room: room_id, count: num+1});
	//console.log("Got a finished move:", move);
      }
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
      $('input#mymove').val(me.move);
      $('input#myfinal').prop('checked', me.isfinal);

      // activate fields for logged-in users
      $('input#myname').prop('disabled', true);
      $('input#join').prop('disabled', true);
      $('input#leave').prop('disabled', false);
      $('input#mymove').prop('disabled', me.isfinal);
      $('input#myfinal').prop('disabled', false);
    } else {
      // disable fields for logged-in users
      $('input#myname').prop('disabled', false);
      $('input#join').prop('disabled', false);
      $('input#leave').prop('disabled', true);
      $('input#mymove').prop('disabled', true);
      $('input#myfinal').prop('disabled', true);
    };
  })


  Template.page.room = function () {
    return Session.get('room_id');
  }

  Template.room.loggedin = function () {
    return Boolean(Session.get('player_id'));
  };

  Template.room.moves = function () {
    return Moves.find({}, {sort: {timestamp: 1}});
  };

  Template.room.players = function () {
    return Players.find({room: Session.get('room_id')}, {sort: {'name':1}});
  };

  Template.welcome.roomname = function () {
    return Random.id()
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

  Template.room.helpers({
    format_time: function (timestamp) {
    	return new Date(timestamp).toString();
    }});

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
      me = player();
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
	Meteor.call('sendChat', Session.get('room_id'), msg);
      }
      $('input#chat').val('');
    }
  });

}

