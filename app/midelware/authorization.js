var jwt = require('jsonwebtoken')
var axios = require('axios')
//midelware
const authUrl = process.env.AUTH_URL
const pl = process.env.PL

exports.ensureAuth = async function (req, res, next) {

  try {

    if (!req.headers.authorization) {
      //return res.status(403).send({ message: 'Error authorization [001]' })
      throw { message: 'Error authorization [001] <---' };
    }

    var token = req.headers.authorization.replace(/['"]+/g, '')

    if (token.indexOf('Bearer ') === -1) {
      /*
      return res.json({
        success: false,
        message: 'Auth token is not supplied'
      })*/

      throw {
        success: false,
        message: 'Auth token is not supplied'
      }


    }


    token = token.replace('Bearer ', '')

    axios.defaults.headers.common['Authorization'] = 'Bearer ' + token
    axios.defaults.headers.common['Session'] = req.headers.session

    //console.log('a ', req.headers.session)

    let res

    await
      axios.post(
        authUrl,
        {
          data: {
            access_token: token,
            pl: pl,
            session: req.headers.session
          }
        })

        .then((r) => {
          res = r
          //console.log('b ')
        })


        .catch(error => {

          console.log('c ', error)
          throw {
            success: false,
            message: error//'Error [0001]'
          }

        })


    if (
      res.data.success === false
      //res.data.error || 
      //res.data.message && res.data.message === 'Token is not valid'
    ) {

      throw res.data

    }

    let useruuid


    jwt.verify(res.data.user, 'userdata', (err, decoded) => {

      if (err) {

        throw {
          success: false,
          message: 'Error decode'
        }

      }


      useruuid = decoded.user.uuid

    })

    req.uuid = useruuid

    next()


  }


  catch (e) {

    //console.log(e)

    res.json(e)


  }

}

exports.public = function (req, res, next) {
  next()
}
