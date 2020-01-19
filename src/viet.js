window.onload = function()
{
    var code = document.getElementById('code');
    var run = document.getElementById('run');

    run.onclick = function() {
        (new VM).interpret(code.value);
    };
};
