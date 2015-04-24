'use strict';

var _                = require('underscore');
var THREE            = require('three');
var FastSimplexNoise = require('fast-simplex-noise');
var tinycolor        = require('tinycolor2');
var Chance           = require('chance');
var models           = require('../models');
var Voxel            = require('./voxel');

var X = 3;
var Y = 2.5;
var Z = 3;

var chance = new Chance();

var colors = {
  'Wood': ['#4C3A1E', '#403019', '#332714'],
  'Green_Roof': ['#B7CE82', '#D9C37E', '#759B8A', '#A78765', '#CE6A58'],
  'Dark_Stone': ['#767D85', '#6A6B5F', '#838577']
};

var Building = function(parent, x, y, width, height, depth) {
  this.amplitude = 1;
  this.frequency = 0.08;
  this.octaves = 16;
  this.persistence = 0.5;

  this.roofPointChance = 0.6;
  this.wallWindowChance = 0.3;
  this.wallDoorChance = 0.1;
  this.bannerChance = 0.1;
  this.shieldChance = 0.1;

  this.heightDampener = 4;

  this.x = x;
  this.y = y;
  this.width = width;
  this.height = height;
  this.depth = depth;

  this.group = new THREE.Group();
  this.group.position.x = x;
  this.group.position.z = y;

  parent.add(this.group);
};

Building.prototype.isSolid = function(x, y, z) {
  if(x < this.width / -2 || x >= this.width / 2) {
    return false;
  }

  if(z < this.depth / -2 || z >= this.depth / 2) {
    return false;
  }

  if(y < 0 || y >= this.height) {
    return false;
  }

  return this.noiseGen.get3DNoise(x, y, z) - y / this.heightDampener > 0; 
};

Building.prototype.generate = function() {
  var self = this;

  this.noiseGen = new FastSimplexNoise({ 
    frequency: this.frequency, 
    octaves: this.octaves,
    amplitude: this.amplitude,
    persistence: this.persistence
  });

  this.group.remove.apply(this.group, this.group.children);
  this.colors = _.chain(colors)
    .mapObject(_.sample)
    .mapObject(function(color) {
      var rgb = tinycolor(color).toRgb();
      
      rgb.r /= 255;
      rgb.g /= 255;
      rgb.b /= 255;
      rgb.hex = color;

      return rgb;
    })
    .value();

  for(var x = -this.width / 2; x < this.width / 2; x++) {
    for(var y = 0; y < this.height; y++) {
      for(var z = -this.depth / 2; z < this.depth / 2; z++) {
        var voxel = new Voxel(_.bind(this.isSolid, this), x, y, z);

        // this._debugBox(voxel);
        this._setFloor(voxel);
        this._setRoof(voxel);
        this._setWalls(voxel);
        this._setPillars(voxel);
      }
    }
  }

  this.group.traverse(function(object) {
    if(object.material && object.material.name.length > 0) {
      var color = self.colors[object.material.name];
      if(color) {
        var material = object.material.clone();

        material.color.r = color.r;
        material.color.g = color.g;
        material.color.b = color.b;

        object.material = material;
      }
    }
  });
};


Building.prototype._setFloor = function(voxel) {
  var floor;

  if(voxel.y === 0 && !voxel.solid) {
    floor = models.get('Plate_Road_01');
    floor.position.set(voxel.x * X, voxel.y * Y - 1.25, voxel.z * Z);
    this.group.add(floor);
  }
  else if(voxel.solid) {
    floor = models.get('Plate_Wood_01');
    floor.position.set(voxel.x * X, voxel.y * Y - 1.25, voxel.z * Z);
    this.group.add(floor);
  }
};

Building.prototype._setRoof = function(voxel) {
  var roof;
  var position = new THREE.Vector3(voxel.x * X, voxel.y * Y, voxel.z * Z);
  var rotation = new THREE.Euler(0, 0, 0, 'XYZ');

  if(voxel.solid && !voxel.up) {
    if(!voxel.north && !voxel.east && !voxel.south && !voxel.west) {
      if(Math.random() < this.roofPointChance) {
        roof = models.get('Roof_Point_Green_01');
        position.y += 1.2;
      }
      else {
        roof = models.get('Roof_Straight_Green_01');
        position.y += 1.2;
        rotation.y = (Math.random() > 0.5) ? Math.PI / 2 : 0;
      }
    }
    else if(!voxel.south && !voxel.north && (voxel.east || voxel.west)) {
      roof = models.get('Roof_Straight_Green_01');
      position.y += 1.2;
      rotation.y = Math.PI / 2;
    }
    else if(!voxel.west && !voxel.east && (voxel.north || voxel.south)) {
      roof = models.get('Roof_Straight_Green_01');
      position.y += 1.2;
    }
    else if(!voxel.south) {
      roof = models.get('Roof_Slant_Green_01');
      position.y += 1.2;
    }
    else if(!voxel.north) {
      roof = models.get('Roof_Slant_Green_01');
      position.y += 1.2;
      rotation.y = Math.PI;
    }
    else {
      roof = models.get('Roof_Flat_Green_01');
      position.y += 1.2;
    }

    if(roof) {
      roof.position.set(position.x, position.y, position.z);
      roof.rotation.set(rotation.x, rotation.y, rotation.z, rotation.order);
      this.group.add(roof);
    }
  }
};

Building.prototype._setWalls = function(voxel) {
  if(!voxel.solid) { return; }  
  
  var wall;
  var sides = [
    [voxel.north, -1, 0, 0],
    [voxel.south, 1, 0, Math.PI],
    [voxel.west, 0, -1, Math.PI / -2], 
    [voxel.east, 0, 1, Math.PI / 2]
  ];

  for(var i = 0; i < sides.length; i++) {
    var side = sides[i];

    if(!side[0]) {
      if(voxel.y === 0 && Math.random() < this.wallDoorChance) {
        wall = models.get('Wood_Door_Round_01');
      }
      else if(Math.random() < this.wallWindowChance) {
        wall = models.get('Wood_Window_Round_01');
      }
      else {
        wall = models.get(_.sample([
          'Wood_Wall_01', 
          'Wood_Wall_Double_Cross_01', 
          'Wood_Wall_Cross_01'
        ]));

        if(Math.random() < this.bannerChance) {
          var banner = models.get('Banner_Short_01');

          banner.rotation.y = Math.PI / -2;
          banner.position.x = -0.2;
          banner.position.y = 0.1;

          wall.add(banner);
        }
        else if(Math.random() < this.shieldChance) {
          var shield = models.get('Shield_Green_01');

          shield.rotation.y = Math.PI;
          shield.position.x = -0.2;
          shield.position.y = 0.8;

          wall.add(shield);
        }
      }

      wall.position.x = voxel.x * X + 1.25 * side[1];
      wall.position.y = voxel.y * Y - 0.95;
      wall.position.z = voxel.z * Z + 1.25 * side[2];
      wall.rotation.y = side[3];

      this.group.add(wall);
    }
  }
};

Building.prototype._setPillars = function(voxel) {
  if(voxel.solid) { return; }

  if(voxel.ceiling) {
    var pillar;
    var pillars = {
      northWest: { place: true, x: -1.2, z: -1.2 },
      northEast: { place: true, x: -1.2, z: 1.2 },
      southWest: { place: true, x: 1.2, z: -1.2 },
      southEast: { place: true, x: 1.2, z: 1.2 }
    };

    if(voxel.north && voxel.west) {
      pillars.northWest.place = false;
    }
    if(voxel.north && voxel.east) {
      pillars.northEast.place = false;
    }
    if(voxel.south && voxel.west) {
      pillars.southWest.place = false;
    }
    if(voxel.south && voxel.east) {
      pillars.southEast.place = false;
    }

    _.each(pillars, function(value) {
      if(!value.place) { 
        return;
      }

      pillar = models.get('Wood_Pole_01');
      pillar.position.x = voxel.x * X + value.x;
      pillar.position.y = voxel.y * Y - 1.25;
      pillar.position.z = voxel.z * Z + value.z;
      this.group.add(pillar);
    }, this);
  }
};

Building.prototype._debugBox = function(voxel) {
  var material, geometry, mesh;

  if(voxel.solid) {   
    material = new THREE.MeshNormalMaterial({ wireframe: true });
    geometry = new THREE.BoxGeometry(X, Y, Z);
    mesh = new THREE.Mesh(geometry, material);

    mesh.position.x = voxel.x * X;
    mesh.position.y = voxel.y * Y;
    mesh.position.z = voxel.z * Z;

    this.group.add(mesh);
  }
};

module.exports = Building;