var publicKey = "";
var verification = {};
var verificationType = '';

function check_login_enter(e){
    if (window.event) // IE
    {
        var keynum = e.keyCode
    }
    else if (e.which) // Netscape/Firefox/Opera
    {
        var keynum = e.which
    }

    /**
     * enter key pressed
     */
    if (keynum == 13) {
        check_login();
    }
}

function _encrypt(str) {
    var encrypt = new JSEncrypt();
    encrypt.setPublicKey(publicKey);
    return encrypt.encrypt(str);
}


function check_login(){
    if(!$('input[name="username_f"]')){showPopToast('浏览器不被支持，请下载专用浏览器以使用本网站。');}
    $('input[name="username_f"]').parent('label').removeClass('label_error');

    $('input[name=btn_submit]').attr('disabled','disabled');
    var username = $('input[name="username_f"]').val();
    var password = $('input[name="password_f"]').val();
    if (isContainEmoji(username)) {
        showPopToast('用户名中不可以输入表情');
        $('input[name=btn_submit]').removeAttr('disabled')
        return;
    }

    if (username && !checkUsername(username)) {
        showPopToast('用户名不正确');
        $('input[name=btn_submit]').removeAttr('disabled')
        return;
    }

    var j_captcha_response = $('input[name="j_captcha_response"]').val();

    if(username && password) {
        if(!publicKey){
            $.post('/user/loginPre.json',
                function (content) {
                    if(content){
                        publicKey = content;
                        check_login_post(username,password,j_captcha_response)
                    }else{
                        showPopToast('请求失败，请稍后重试');
                        $('input[name=btn_submit]').removeAttr('disabled')
                        return ;
                    }
                })
        } else {
            check_login_post(username,password,j_captcha_response)
        }

    }else{
        showPopToast('请输入用户名和密码。');
        $('input[name=btn_submit]').removeAttr('disabled')
    }
}

function check_login_post(username,password,j_captcha_response,loginCaptcha) {
    var $btn = $(document.flogin.btn_submit);
    $btn.attr('disabled', 'disabled');

    var username_f = username;
    var password_f = password;

    username = _encrypt(username)
    password = _encrypt(password)

    var trusted = $('#trusted').attr('checked')? true:false;
    $.ajax({url: "/user/toLoginCheck.json",
        type: "POST",
        dataType: "json",
        async:true,
        timeout: 20000, // sets timeout to 3 seconds
        data: {'username': username, 'password': password,'j_captcha_response':j_captcha_response,enc:'rsa','agreePrivacy':true,'verificationCaptcha':loginCaptcha,'trusted':trusted},
        // Callback function on completion (optional)
        success: function (content, status, response) {
            if (content.message.indexOf('， ') >= 0) {
                $btn.css('height', '60px');
                $btn.css('line-height', '30px');
            } else {
                $btn.css('height', '40px');
                $btn.css('line-height', '40px');
            }
            content.message = content.message.replace(/， /g, '\n');

            $btn.addClass('smaller').val(content.message);
            if (content.status === 1) {
                closeVerification();
                if (content.login && content.login.lastLogin) {
                    var lastLogin = content.login.lastLogin;
                    var str = "最后登录于："
                        + ((typeof (lastLogin.city) != 'undefined' && lastLogin.city != '' && lastLogin.city != 'ERROR') ? lastLogin.city + '，' : '')
                        + ((typeof (lastLogin.loginTime) != 'undefined' && lastLogin.loginTime != '') ? dateTimeLongToString(lastLogin.loginTime, "yyyy-MM-dd HH:mm:ss") + '，' : '')
                        + ((typeof (lastLogin.remoteIp) != 'undefined' && lastLogin.remoteIp != '') ? lastLogin.remoteIp : '');
                    $('.loginMessage').html(str);
                }

                sumbitLogin(username,password);

            }else if(content.status===-10) {
                //邮件地址未验证
                showPopToast('邮箱未验证');
                // show_confirm_modal();
                $('input[name="username_f"]').parent('label').addClass('label_error');
                removeDisabled($btn, 2);
            }else if(content.status===-11) {
                //手机号码未验证
                showPopToast('手机号未验证');
                $('input[name="username_f"]').parent('label').addClass('label_error');
                removeDisabled($btn, 2);
            }else if(content.status===-300){
                showPopToast('需要验证码');
                // $('.yzm_li').show();
                $('.labelqrcode').removeClass('hide');
                removeDisabled($btn, 2);
            } else if(content.status===-50 && content.readAgreement){
                $('input[name="username"]').val(username);
                $('input[name="password"]').val(password);
                $('#index_bg').show();
                $('#reAgreementPopupLayer').show();
                removeDisabled($btn, 2);
            } else if(content.status===-60){

                $btn.val('登录')
                var infoHtml = '';
                if(content.verification){
                    verification = content.verification;
                    if(content.verification.phone && content.verification.email){
                        infoHtml = "" +
                            //  "<div style='display: block; height: 1px; width: 100%; margin: 24px 0;'><div style='color: #909399; left: 40%; position: absolute;background-color: #fff;padding: 0 20px;font-weight: 500;'>验证方式</div></div>" +
                            "" +
                            "<div class=\"index_left_tt clearfix zixuan-tab mt0 verification_tab_tt\">\n" +
                            "                <dl class=\"tab_btn pl0 mt10\">\n" +
                            "                    <dt class=\"on w150 ml0\">手机</dt>\n" +
                            "                    <dt class=\"w150\">邮箱</dt>\n" +
                            "                </dl>\n" +
                            "            </div>";

                        infoHtml += '<div id="verificationInfo" class="verification_tab_div" >验证手机: ' + content.verification.phone + "</div>";
                        verificationType = 'phone';
                        $('#loginCheckModal').removeClass("h290");
                        $('#emailCaptchaSection').addClass('hide');
                        $('#phoneCaptchaSection').removeClass('hide');
                    } else if (content.verification.phone){
                        infoHtml = '<div id="verificationInfo" class="verification_tab_div" >验证手机: ' + content.verification.phone + "</div>";
                        verificationType = 'phone';
                        $('#loginCheckModal').addClass("h290");
                        $('#emailCaptchaSection').addClass('hide');
                        $('#phoneCaptchaSection').removeClass('hide');
                    } else {
                        infoHtml = '<div id="verificationInfo" class="verification_tab_div" >验证邮箱: ' + content.verification.email + "</div>";
                        verificationType = 'email';
                        $('#loginCheckModal').addClass("h290")
                        $('#phoneCaptchaSection').addClass('hide');
                        $('#emailCaptchaSection').removeClass('hide');
                    }

                    if(content.message){
                        infoHtml += '<div  style="margin: 0px 40px 0px 40px;">' +content.message +'</div>' ;
                    }
                }

                $('#index_bg').show();
                $('#loginCheckModal').show();
                $('#checkInfo').html(infoHtml);

                // 设置图形验证码
                if (content.verification.captcha) {
                    $('#login_captcha').attr('src','data:image/png;base64,' + content.verification.captcha);
                }

                // 清除短信验证码输入框
                $('#login_check_captcha').val('');

                // 清除错误提示
                cleanInfo();

                addVerificationFunction();
                removeDisabled($btn, 2);
            } else if(content.status===-61){
                $('#loginCaptchaTip').html(content.captchaInfo);
            } else {
                //$('.labelqrcode img').attr('src','../jcaptcha?' + makeid(6));    //change captach
                if(content.status===-1){
                    $btn.val(content.message + ",请检查大小写是否锁定");
                    removeDisabled($btn, 3);
                } else {
                    removeDisabled($btn, 2);
                }
            }
        },
        error:function(xhr,status,error){
            switch (xhr.status){
                case 408:
                    alert('请求超时:' + status + ' ' + xhr.status + "\r\n错误信息:" + error);
                    break;
                default:
                    alert('进行登录时发生错误:' + status + ' ' + xhr.status +
                        "\r\n错误信息:" + error + "\r\n访问地址：" + document.location
                        +'\r\n' + navigator.userAgent);
            }
            removeDisabled($btn, 2);
        },
        complete:function () {
            // removeDisabled($btn, 2);
        }
    });
}


// function sumbitLogin(username,password,username_f,password_f) {
//     $('input[name="username"]').val(username);
//     $('input[name="password"]').val(password);
//
//     KYBStore.save('AGREE_AGREEMENT',true);
//     $('input[name="password_f"]').val('');
//     $('input[name="username_f"]').val('');
//     document.flogin.submit();
//
//     $('input[name="password_f"]').val(password_f);
//     $('input[name="username_f"]').val(username_f);
// }

function sumbitLogin(username,password,loginCaptcha) {
    // 保存同意协议状态
    KYBStore.save('AGREE_AGREEMENT', true);

    // 获取表单中的所有参数
    var formData = {
        email: username,
        password: password,
        signonForwardAction: $('input[name="signonForwardAction"]').val(),
        login_submit: $('input[name="login_submit"]').val(),
        newlogin: $('input[name="newlogin"]').val(),
        enc: $('input[name="enc"]').val(),
        trusted: $('#trusted').attr('checked') ? true : false,
        agreePrivacy: true,
        verificationCaptcha: loginCaptcha,
        captcha: $('#lmg_captcha_input').val(),
        verificationType: verificationType
    };

    doPostRequest("/user/toLogin.json", formData, function (data) {
        if (data && data.status > 0 ) {
            window.location.href = data.redirectUrl;
        } else if(data && data.status == -61){
            $('#loginCaptchaTip').html(data.message);
        } else if(data && data.status == -62){
            $('#imgCaptchaTip').html(data.message);
        }  else if(data && data.status == -63){
            $('#loginCaptchaTip').html(data.message);
            // 刷新图形验证码并清空输入框
            $('#login_captcha').attr('src','/user/loginCaptcha.json?' + makeid(6));
            $('#lmg_captcha_input').val('');
            //禁用验证按钮
            $('#verification_btn').attr('disabled','disabled');
            $('#verification_btn').addClass("btnwhite_nohover");
        }
    });


}

function removeDisabled(con, time) {
    if (time != null) {
        setTimeout(function (){
            // console.log('延迟：' + time);
            con.removeAttr('disabled');
        }, time * 1000);
    } else {
        con.removeAttr('disabled');
    }
}


function show_confirm_modal(){
    document.fconfirm.email.value=document.flogin.username_f.value;
    $('.modal .alert').hide();
    $('#myModal').modal('show');
}

function submit_confirm_params(src){
    if(src.form.code.value!='' && src.form.email.value!='') {
        $.ajax({
            url: '/user/confirmEmail.json',
            type: 'post',
            /*contentType: 'application/json; charset=utf-8',*/
            data: {'email':src.form.email.value,'code':src.form.code.value},
            success: function (data) {
                if (data.ret>0) {
                    $('.modal .alert').html('邮件地址验证通过，请重新登录');
                    $('#myModal').modal('hide');
                    $('input[name=btn_submit]').val('邮件地址验证通过，请重新登录').removeAttr('disabled');
                } else {
                    $('.modal .alert').html('验证失败：' + data.message);
                }
                $('.modal .alert').show();
            }
        })
    }
}


function resend_confirm_email(src){
    if(src.form.email.value!='') {
        src.disabled=true;
        src.value='正在发送...';
        $.ajax({
            url: '/user/resendConfirmEmail.json',
            type: 'post',
            data: {'email':src.form.email.value},
            success: function (data) {
                if (data.ret>0) {
                    $('.modal .alert').html('验证码已经发送到你的邮箱，请查收后进行确认');
                } else {
                    $('.modal .alert').html('邮件验证码发送失败：' + data.message);
                }
                $('.modal .alert').show();
            }
        })
    }
}

function agreePrivacy() {
    KYBStore.save('AGREE_AGREEMENT',true);
    document.flogin.submit();
}

function checkUsername(username) {
    if(/^\d{11}$/.test(username.trim()) || /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,4}$/.test(username.trim())){
        return true
    }
    return false;
}

function closePopToast() {
    $('.popupAlert_popupLayer').hide();
    $('#jsrAlert').hide();
//        $('.popupLayer-bg').hide();
}

$(document).ready(function() {

    $('.yh-input-checkbox').click(function(){
        var self = $(this);
        var input = self.children('input');
        var value = !input.attr('checked');
        input.attr('checked', value);
        if(value){
            self.addClass('yh-input-checkbox-checked');
            //推送页面
            // $(this).parents(".timeset_r_list").find(".select-main").removeClass("disabled");
        }else{
            self.removeClass('yh-input-checkbox-checked');
            // $(this).parents(".timeset_r_list").find(".select-main").addClass("disabled");
        }
        return false;
    });

    $('.input-checkbox').click(function(){
        var self = $(this);
        var input = self.children('input');
        var value = !input.attr('checked');
        input.attr('checked', value);

        if(value){
            self.addClass('input-checkbox-checked');
            if(input && input[0]) {
                if (input && input[0] && input[0].id == 'isAgree') {
                    $('textarea[name="btn_submit"]').val('登录');
                    $('textarea[name="btn_submit"]').attr('class', 'btnred');
                    $('textarea[name="btn_submit"]').removeAttr('disabled');
                } else if (input[0].id == 'trusted') {
                    KYBStore.save('LOGIN_TRUSTED', true);
                    $('input[name="trusted"]').val('true');
                }
            }
        }else{
            self.removeClass('input-checkbox-checked');
            if(input && input[0]){
                if(input[0].id == 'isAgree') {
                    $('textarea[name="btn_submit"]').val('请阅读并同意服务协议');
                    $('textarea[name="btn_submit"]').removeClass('btnred');
                    $('textarea[name="btn_submit"]').attr('disabled', 'disabled')
                } else if(input[0].id == 'trusted'){
                    KYBStore.save('LOGIN_TRUSTED',false);
                    $('input[name="trusted"]').val('false');
                }
            }
        }
        return false;
    });

    $(document.flogin.password).keypress(check_login_enter);
    // $.getJSON('../rest/iplocation',function(content){
    //     $('.ip_location').html(content.message);
    // });
    //测试一下ajax
    // $.ajax({url: "/user/loginCheck.json",
    //     type: "POST",
    //     dataType: "json",
    //     async:true,
    //     timeout: 10000, // sets timeout to 3 seconds
    //     data: {'username': '', 'password': ''},
    //     // Callback function on completion (optional)
    //     success: function (content, status, response) {
    //         console.log('ajax test passed');
    //     },
    //     error:function(xhr,status,error){
    //         console.log('ajax test failed:' + xhr);
    //         alert('登录网络检测失败:' + status + ' ' + xhr.status +
    //             "\r\n错误信息:" + error + "\r\n访问地址：" + document.location
    //             + '\r\n' + navigator.userAgent);
    //     },
    //     complete:function () {
    //         console.log('ajax test completed.');
    //     }
    // });

    var loc = document.location;
    if(loc.protocol=='http:' &&
        (loc.host=='www.kanyanbao.com' ||
        loc.host.indexOf('kanzhiqiu.com')>0 ||
        loc.host.startsWith('ww0') ||
        loc.host.startsWith('ww1'))){
        var https_url = 'https://' + loc.host + '/user/login.htm';
        if(confirm('当前访问地址是：\r\n' + loc.href + '\r\n\r\n并非更加安全的https，如果您公司允许使用https，' +
                '请改用https地址访问：\r\n' + https_url + '\r\n\r\n点击确定将自动访问此https地址，点击取消继续以当前方式访问。')){
            document.location = https_url;
        }
    }

    //已同意协议自动勾选
    if( KYBStore.getStore('AGREE_AGREEMENT')){
        $('#agree_checkbox').click();
    }

    //授信登录
    if( KYBStore.getStore('LOGIN_TRUSTED')){
        $('#trusted_checkbox').click();
        $('input[name="trusted"]').val('true');
    }

});

function closeVerification(){
    $('#index_bg').hide();
    $('#loginCheckModal').hide();
    $('#login_captcha_input').val('');
    $('#lmg_captcha_input').val('');
    $('#verification_btn').attr('disabled','disabled');
    $('#verification_btn').addClass("btnwhite_nohover");
    $('textarea[name="btn_submit"]').removeAttr('disabled');
    cleanInfo();
}

function cleanInfo(){
    $('#imgCaptchaTip').html('');
    $('#loginCaptchaTip').html('');
}

function addVerificationFunction() {

    $('.tab_btn dt').click(function () {
        if ($(this.className == '')) {
            $(this).addClass('on').siblings().removeClass('on');
        }

        var text = $(this)[0].innerHTML;

        // 刷新图形验证码并清空输入框
        $('#login_captcha').attr('src','/user/loginCaptcha.json?' + makeid(6));
        $('#lmg_captcha_input').val('');

        // 更新验证信息
        if (text == "邮箱") {
            $('#verificationInfo').html('验证邮箱: ' + verification.email ) ;
            verificationType = 'email';
        } else {
            $('#verificationInfo').html('验证手机: ' + verification.phone ) ;
            verificationType = 'phone';
        }

        // 根据验证类型显示不同的验证码区域
        if (verificationType === 'email') {
            $('#emailCaptchaSection').removeClass('hide');
            $('#phoneCaptchaSection').addClass('hide');
        } else {
            // 默认隐藏邮箱验证码部分
            $('#emailCaptchaSection').addClass('hide');
            $('#phoneCaptchaSection').removeClass('hide');
        }

        // 切换验证类型后禁用验证按钮
        $('#verification_btn').attr('disabled','disabled');
        $('#verification_btn').addClass("btnwhite_nohover");

    });
}



function sendCheckCaptcha() {
    // 获取验证码按钮
    var $btn = verificationType === 'email' ? $('#form_emailpost_button') : $('#form_mobilepost_button');
    if($btn.attr("disabled")==='disabled'){return;}

    var captcha = $('#lmg_captcha_input').val();
    if(!captcha){
        showPopToast('请输入图形验证码');
        return;
    }

    // 设置按钮为不可点击状态
    $btn.attr("disabled", "disabled").addClass("btnwhite_nohover");
    doPostRequest("/user/sendLoginCaptcha.json", {captcha: captcha,type:verificationType}, function (data) {
        if (data && data.ret > 0 ) {
            showPopToast(data.message);
            cleanInfo();
            $('#verification_btn').removeAttr("disabled").removeClass("btnwhite_nohover");

            // 开始60秒倒计时
            var countdown = 60;
            $btn.text( "(" + countdown + ")");

            // 保存当前类型的定时器
            var timer = setInterval(function() {
                countdown--;
                if (countdown > 0) {
                    $btn.text( "(" +countdown + ")");
                } else {
                    clearInterval(timer);
                    $btn.text("获取验证码").removeAttr("disabled").removeClass("btnwhite_nohover");
                }
            }, 1000);
        } else {
            $('#imgCaptchaTip').html(data.message);
            $btn.removeAttr("disabled").removeClass("btnwhite_nohover"); // 失败时恢复按钮
        }
    });
}

function verificationLogin() {
    var username = $('input[name="username_f"]').val();
    var password = $('input[name="password_f"]').val();
    var loginCaptcha = verificationType === 'email' ? $('#login_email_captcha').val() : $('#login_check_captcha').val();
    username = _encrypt(username)
    password = _encrypt(password)
    sumbitLogin(username,password,loginCaptcha);
}

function checkLoginCaptcha() {
    if($('#verification_btn').attr("disabled")=='disabled'){
        return;
    }
    cleanInfo();

    var captcha = $('#lmg_captcha_input').val();
    if(!captcha){
        $('#imgCaptchaTip').html('请输入图形验证码');
        return;
    }

    var loginCaptcha = verificationType === 'email' ? $('#login_email_captcha').val() : $('#login_check_captcha').val();
    if(!loginCaptcha){
        $('#loginCaptchaTip').html('请输入验证码');
        return;
    }

    verificationLogin();
    //closeVerification();
}
