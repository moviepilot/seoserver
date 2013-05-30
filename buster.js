var config = module.exports;

config["My tests"] = {
    rootPath: ".",
    environment: "node",
    sources: [
        "lib/seoserver.js"
    ],
    tests: [
        "test/*-test.js"
    ]
}

