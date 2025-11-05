const app = angular.module("emotionApp", []);

// Authentication service for login 
app.factory("AuthService", function($http, $window) {
  const storageKey = "emotionAppAuth";
  let currentUser = null;
  let token = null;

  function loadFromStorage() {
    const saved = $window.localStorage.getItem(storageKey);
    if (saved) {
      const data = JSON.parse(saved);
      token = data.token;
      currentUser = data.user;
      $http.defaults.headers.common.Authorization = "Bearer " + token;
    }
  }

  function saveToStorage() {
    if (token && currentUser) {
      $window.localStorage.setItem(
        storageKey,
        JSON.stringify({ token, user: currentUser })
      );
    }
  }

  loadFromStorage();

  return {
    login(username, password) {
      return $http
        .post("/api/login", { username, password })
        .then(response => {
          token = response.data.token;
          currentUser = response.data.user;
          $http.defaults.headers.common.Authorization = "Bearer " + token;
          saveToStorage();
          return currentUser;
        });
    },
    logout() {
      token = null;
      currentUser = null;
      $window.localStorage.removeItem(storageKey);
      delete $http.defaults.headers.common.Authorization;
    },
    getUser() {
      return currentUser;
    },
    isLoggedIn() {
      return !!currentUser;
    }
  };
});

// Emotion service 
app.factory("EmotionService", function($http) {
  return {
    getAll() {
      return $http.get("/api/emotions").then(res => res.data);
    },
    analyze(text) {
      return $http
        .post("/api/emotions/analyze", { text })
        .then(res => res.data);
    }
  };
});

// Main controller
app.controller("MainController", function(AuthService, EmotionService) {
  const vm = this;

  vm.loginData = { username: "", password: "" };
  vm.loginError = "";
  vm.currentUser = AuthService.getUser();
  vm.emotions = [];
  vm.newText = "";
  vm.loading = false;
  vm.analyzeError = "";

  vm.isLoggedIn = function() {
    return AuthService.isLoggedIn();
  };

  vm.isAdmin = function() {
    return vm.currentUser && vm.currentUser.role === "admin";
  };

  vm.isViewer = function() {
    return vm.currentUser && vm.currentUser.role === "viewer";
  };

  vm.login = function() {
    vm.loginError = "";
    AuthService.login(vm.loginData.username, vm.loginData.password)
      .then(user => {
        vm.currentUser = user;
        vm.loadEmotions();
      })
      .catch(() => {
        vm.loginError = "Invalid username or password.";
      });
  };

  vm.logout = function() {
    AuthService.logout();
    vm.currentUser = null;
    vm.emotions = [];
    vm.newText = "";
  };

  vm.loadEmotions = function() {
    EmotionService.getAll()
      .then(data => {
        vm.emotions = data;
      })
      .catch(err => {
        console.error("Error loading emotions", err);
      });
  };

  vm.analyze = function() {
    vm.analyzeError = "";

    if (!vm.newText || vm.newText.trim().length === 0) {
      vm.analyzeError = "Please enter some text first.";
      return;
    }

    vm.loading = true;

    EmotionService.analyze(vm.newText)
      .then(entry => {
        vm.emotions.push(entry);
        vm.newText = "";
      })
      .catch(err => {
        console.error("Error analyzing text", err);
        vm.analyzeError = "Error while analyzing text.";
      })
      .finally(() => {
        vm.loading = false;
      });
  };

  // Previous session data
  if (vm.currentUser) {
    vm.loadEmotions();
  }
});
