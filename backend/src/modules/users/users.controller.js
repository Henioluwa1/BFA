const UsersService = require('./users.service');
const ApiResponse = require('../../utils/apiResponse');

class UsersController {
  static async listUsers(req, res, next) {
    try {
      const users = await UsersService.listUsers(req.query, req.user);
      return ApiResponse.success(res, {
        message: 'Users retrieved successfully.',
        data: users,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getUserById(req, res, next) {
    try {
      const user = await UsersService.getUserById(req.params.id);
      return ApiResponse.success(res, {
        message: 'User retrieved successfully.',
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }

  static async createUser(req, res, next) {
    try {
      const user = await UsersService.createUser(req.body, req.user, req);
      return ApiResponse.created(res, {
        message: 'User created successfully.',
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateUser(req, res, next) {
    try {
      const user = await UsersService.updateUser(req.params.id, req.body, req.user, req);
      return ApiResponse.success(res, {
        message: 'User updated successfully.',
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getRoles(req, res, next) {
    try {
      const roles = UsersService.getRoles();
      return ApiResponse.success(res, {
        message: 'System roles and permissions retrieved.',
        data: roles,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = UsersController;
