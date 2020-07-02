require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const uniqueValidator = require("mongoose-unique-validator");

const app = express();

const { PORT, DB_URI } = process.env;

const userSchema = mongoose.Schema({
  username: { type: String, required: true, minlength: 3, unique: true },
  log: [{ description: String, duration: Number, date: String, _id: false }],
});

userSchema.plugin(uniqueValidator);

userSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    delete returnedObject.__v;
  },
});

const User = mongoose.model("User", userSchema);

mongoose
  .connect(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("connected to MongoDB");

    User.deleteMany({}).then(() => console.log("Users cleared from db"));
  })
  .catch((error) => {
    console.log("error connecting to MongoDB:", error.message);
  });

mongoose.set("useCreateIndex", true);
mongoose.set("useFindAndModify", false);

app.use(cors());

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(`${__dirname}/views/index.html`);
});

app.post("/api/exercise/new-user", async (req, res, next) => {
  const { username } = req.body;

  try {
    const user = new User({ username });
    const savedUser = await user.save();
    res.json({ _id: savedUser._id, username: savedUser.username });
  } catch (e) {
    next(e);
  }
});

app.get("/api/exercise/users", async (req, res) => {
  const users = await User.find({})
    .select({ _id: 1, username: 1 })
    .lean();

  res.json(users);
});

app.post("/api/exercise/add", async (req, res, next) => {
  const { body } = req;

  try {
    const user = await User.findById(body.userId);

    const newExercise = {
      description: body.description,
      duration: body.duration,
      date: new Date(body.date).toDateString() || new Date().toDateString(),
    };
    user.log.push(newExercise);
    await user.save();
    res.json({
      ...newExercise,
      username: user.username,
      _id: user._id,
    });
  } catch (e) {
    next(e);
  }
});

const isValidDate = (d) => {
  return d instanceof Date && Number.isFinite(d.getTime());
};

app.get("/api/exercise/log", async (req, res, next) => {
  const { userId, from, to, limit } = req.query;

  try {
    const user = await User.findById(userId);
    const logs = [...user.log];
    let filteredLogs = logs;

    if (isValidDate(new Date(from)) && isValidDate(new Date(to))) {
      filteredLogs = filteredLogs.filter((log) => {
        const date = new Date(log.date).setHours(0, 0, 0, 0);
        return (
          date >= new Date(from).setHours(0, 0, 0, 0) &&
          date <= new Date(to).setHours(0, 0, 0, 0)
        );
      });
    }

    if (Number.isFinite(Number.parseInt(limit, 10))) {
      filteredLogs = filteredLogs.slice(0, Number.parseInt(limit, 10));
    }

    const count = filteredLogs.length;

    res.json({
      _id: user._id,
      username: user.username,
      count,
      log: filteredLogs,
    });
  } catch (e) {
    next(e);
  }
});

// Not found middleware
app.use((req, res, next) => {
  res.sendStatus(404);

  next();
});

// Error Handling middleware
app.use((err, req, res, next) => {
  if (!err) next();

  let errCode;
  let errMessage;

  if (err.errors) {
    // mongoose validation error
    errCode = 400; // bad request
    const keys = Object.keys(err.errors);
    // report the first validation error
    errMessage = err.errors[keys[0]].message;
  } else {
    // generic or custom error
    errCode = err.status || 500;
    errMessage = err.message || "Internal Server Error";
  }
  res
    .status(errCode)
    .type("txt")
    .send(errMessage);
});

const listener = app.listen(PORT || 3000, () => {
  console.log(`Your app is listening on port ${listener.address().port}`);
});
